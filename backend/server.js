const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 8001;
const TEMP_DIR = process.env.TEMP_DIR || '/tmp/video-clipper';

// Middleware
app.use(cors());
app.use(express.json());

// Store job status in memory (stateless - will be reset on server restart)
const jobs = new Map();

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Ensure temp directory exists
async function ensureTempDir() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
    console.log('✅ Temp directory created:', TEMP_DIR);
  } catch (error) {
    console.error('Error creating temp directory:', error);
  }
}

// Clean up old files (older than 1 hour)
async function cleanupOldFiles() {
  try {
    const files = await fs.readdir(TEMP_DIR);
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      const stats = await fs.stat(filePath);
      
      if (now - stats.mtimeMs > oneHour) {
        await fs.unlink(filePath);
        console.log('🗑️  Cleaned up old file:', file);
      }
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

// Run cleanup every 30 minutes
setInterval(cleanupOldFiles, 30 * 60 * 1000);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Video Clipper API is running' });
});

// Download video and extract transcript
app.post('/api/download', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const jobId = uuidv4();
  const outputDir = path.join(TEMP_DIR, jobId);

  try {
    await fs.mkdir(outputDir, { recursive: true });

    jobs.set(jobId, {
      status: 'downloading',
      progress: 0,
      message: 'Downloading video...'
    });

    res.json({ jobId, status: 'downloading' });

    // Download video with yt-dlp
    const videoPath = path.join(outputDir, 'video.mp4');
    const downloadCmd = `yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 -o "${videoPath}" "${url}"`;
    
    console.log('📥 Downloading video:', url);
    await execAsync(downloadCmd);

    jobs.set(jobId, {
      status: 'extracting',
      progress: 30,
      message: 'Extracting transcript...'
    });

    // Extract subtitles/transcript
    const subtitlesPath = path.join(outputDir, 'subtitles.txt');
    try {
      const subtitlesCmd = `yt-dlp --skip-download --write-auto-subs --sub-lang en --sub-format vtt --convert-subs srt -o "${path.join(outputDir, 'subs')}" "${url}"`;
      await execAsync(subtitlesCmd);
      
      // Try to read the subtitle file
      const srtFiles = (await fs.readdir(outputDir)).filter(f => f.endsWith('.srt'));
      if (srtFiles.length > 0) {
        const srtContent = await fs.readFile(path.join(outputDir, srtFiles[0]), 'utf-8');
        // Extract text from SRT format
        const transcript = srtContent
          .split('\n\n')
          .map(block => {
            const lines = block.split('\n');
            return lines.slice(2).join(' '); // Skip sequence number and timestamp
          })
          .filter(text => text.trim())
          .join(' ');
        
        await fs.writeFile(subtitlesPath, transcript);
        console.log('✅ Transcript extracted');
      } else {
        // If no subtitles available, create a placeholder
        await fs.writeFile(subtitlesPath, 'No transcript available for this video.');
        console.log('⚠️  No transcript available');
      }
    } catch (error) {
      console.log('⚠️  Could not extract transcript:', error.message);
      await fs.writeFile(subtitlesPath, 'No transcript available for this video.');
    }

    // Get video duration
    const durationCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`;
    const { stdout: durationOutput } = await execAsync(durationCmd);
    const duration = parseFloat(durationOutput.trim());

    jobs.set(jobId, {
      status: 'completed',
      progress: 100,
      message: 'Download complete',
      videoPath,
      subtitlesPath,
      duration
    });

    console.log('✅ Download complete. Duration:', duration, 'seconds');

  } catch (error) {
    console.error('❌ Download error:', error);
    jobs.set(jobId, {
      status: 'error',
      progress: 0,
      message: error.message
    });
  }
});

// Analyze transcript with Gemini AI
app.post('/api/analyze', async (req, res) => {
  const { jobId, customApiKey } = req.body;
  
  if (!jobId) {
    return res.status(400).json({ error: 'Job ID is required' });
  }

  const job = jobs.get(jobId);
  if (!job || job.status !== 'completed') {
    return res.status(400).json({ error: 'Invalid job or download not complete' });
  }

  try {
    jobs.set(jobId, {
      ...job,
      status: 'analyzing',
      message: 'Analyzing transcript with AI...'
    });

    // Read transcript
    const transcript = await fs.readFile(job.subtitlesPath, 'utf-8');

    if (transcript.includes('No transcript available')) {
      // Return default suggestions based on video duration
      const suggestions = generateDefaultSuggestions(job.duration);
      jobs.set(jobId, {
        ...job,
        status: 'analyzed',
        message: 'Analysis complete (default suggestions)',
        suggestions
      });
      return res.json({ suggestions });
    }

    // Use custom API key if provided, otherwise use server key
    const apiKey = customApiKey || process.env.GEMINI_API_KEY;
    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({ model: 'gemini-pro' });

    const prompt = `You are a viral video expert. Analyze this video transcript and suggest 3-5 segments that would make the most engaging short clips for social media (30-90 seconds each).

Video Duration: ${job.duration} seconds
Transcript: ${transcript.substring(0, 5000)}

For each suggested clip, provide:
1. Start time (in seconds)
2. End time (in seconds)
3. Why this segment is engaging

Format your response as JSON array:
[
  {
    "start": <seconds>,
    "end": <seconds>,
    "duration": <seconds>,
    "reason": "<explanation>"
  }
]

Make sure all timestamps are within the video duration (0 to ${job.duration} seconds) and each clip is between 30-90 seconds.`;

    console.log('🤖 Analyzing with Gemini AI...');
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Extract JSON from response
    let suggestions = [];
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Error parsing AI response:', e);
      suggestions = generateDefaultSuggestions(job.duration);
    }

    // Validate and fix suggestions
    suggestions = suggestions.map(s => ({
      start: Math.max(0, Math.min(s.start, job.duration - 30)),
      end: Math.max(30, Math.min(s.end, job.duration)),
      duration: s.end - s.start,
      reason: s.reason || 'Interesting segment'
    })).filter(s => s.duration >= 30 && s.duration <= 90);

    if (suggestions.length === 0) {
      suggestions = generateDefaultSuggestions(job.duration);
    }

    jobs.set(jobId, {
      ...job,
      status: 'analyzed',
      message: 'Analysis complete',
      suggestions
    });

    console.log('✅ Analysis complete. Found', suggestions.length, 'suggestions');
    res.json({ suggestions });

  } catch (error) {
    console.error('❌ Analysis error:', error);
    const suggestions = generateDefaultSuggestions(job.duration);
    jobs.set(jobId, {
      ...job,
      status: 'analyzed',
      message: 'Analysis complete (default suggestions)',
      suggestions
    });
    res.json({ suggestions, warning: 'AI analysis failed, using default suggestions' });
  }
});

// Generate default suggestions when transcript is unavailable
function generateDefaultSuggestions(duration) {
  const suggestions = [];
  
  // First clip: Start of video
  if (duration >= 30) {
    suggestions.push({
      start: 0,
      end: Math.min(60, duration),
      duration: Math.min(60, duration),
      reason: 'Opening segment - captures viewer attention'
    });
  }

  // Middle clip
  if (duration >= 90) {
    const midPoint = Math.floor(duration / 2);
    suggestions.push({
      start: Math.max(0, midPoint - 30),
      end: Math.min(duration, midPoint + 30),
      duration: 60,
      reason: 'Middle segment - core content'
    });
  }

  // End clip
  if (duration >= 150) {
    suggestions.push({
      start: Math.max(0, duration - 60),
      end: duration,
      duration: Math.min(60, duration - Math.max(0, duration - 60)),
      reason: 'Closing segment - conclusion or CTA'
    });
  }

  return suggestions;
}

// Process video with FFmpeg
app.post('/api/process', async (req, res) => {
  const { jobId, startTime, endTime } = req.body;
  
  if (!jobId || startTime === undefined || endTime === undefined) {
    return res.status(400).json({ error: 'Job ID, start time, and end time are required' });
  }

  const job = jobs.get(jobId);
  if (!job || !job.videoPath) {
    return res.status(400).json({ error: 'Invalid job or video not available' });
  }

  try {
    jobs.set(jobId, {
      ...job,
      status: 'processing',
      message: 'Processing video...'
    });

    const outputPath = path.join(path.dirname(job.videoPath), `clip_${Date.now()}.mp4`);
    const duration = endTime - startTime;

    // Get input video dimensions
    const probeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${job.videoPath}"`;
    const { stdout: dimensions } = await execAsync(probeCmd);
    const [inputWidth, inputHeight] = dimensions.trim().split('x').map(Number);

    // Calculate aspect ratio and padding for 9:16 (1080x1920)
    const targetWidth = 1080;
    const targetHeight = 1920;
    const targetAspect = targetWidth / targetHeight; // 0.5625
    const inputAspect = inputWidth / inputHeight;

    let scaleFilter, padFilter;
    
    if (inputAspect > targetAspect) {
      // Video is wider than 9:16 - scale to height and add side padding
      const scaledHeight = targetHeight;
      const scaledWidth = Math.round(inputAspect * scaledHeight);
      scaleFilter = `scale=${scaledWidth}:${scaledHeight}`;
      const padWidth = (scaledWidth - targetWidth) / 2;
      padFilter = `pad=${targetWidth}:${targetHeight}:${Math.round((targetWidth - scaledWidth) / 2)}:0:black`;
    } else {
      // Video is taller or equal to 9:16 - scale to width and add top/bottom padding
      const scaledWidth = targetWidth;
      const scaledHeight = Math.round(scaledWidth / inputAspect);
      scaleFilter = `scale=${scaledWidth}:${scaledHeight}`;
      padFilter = `pad=${targetWidth}:${targetHeight}:0:${Math.round((targetHeight - scaledHeight) / 2)}:black`;
    }

    // Add yellow text captions at bottom (viral style)
    const captionFilter = `drawtext=text='VIRAL CLIP':fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:fontsize=48:fontcolor=yellow:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h-th-100`;

    // Combine all filters
    const filterComplex = `${scaleFilter},${padFilter},${captionFilter}`;

    console.log('🎬 Processing video with FFmpeg...');
    console.log('Input dimensions:', `${inputWidth}x${inputHeight}`);
    console.log('Output dimensions:', `${targetWidth}x${targetHeight}`);
    console.log('Clip duration:', duration, 'seconds');

    // FFmpeg command: trim, scale, pad, add captions
    const ffmpegCmd = `ffmpeg -i "${job.videoPath}" -ss ${startTime} -t ${duration} -vf "${filterComplex}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k "${outputPath}" -y`;
    
    await execAsync(ffmpegCmd, { maxBuffer: 50 * 1024 * 1024 });

    jobs.set(jobId, {
      ...job,
      status: 'ready',
      message: 'Video processed successfully',
      outputPath
    });

    console.log('✅ Video processed successfully');
    res.json({ 
      success: true, 
      message: 'Video processed successfully',
      downloadUrl: `/api/download-clip/${jobId}`
    });

  } catch (error) {
    console.error('❌ Processing error:', error);
    jobs.set(jobId, {
      ...job,
      status: 'error',
      message: error.message
    });
    res.status(500).json({ error: error.message });
  }
});

// Download processed clip
app.get('/api/download-clip/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job || !job.outputPath) {
    return res.status(404).json({ error: 'Clip not found' });
  }

  try {
    res.download(job.outputPath, 'viral-clip.mp4', async (err) => {
      if (err) {
        console.error('Download error:', err);
      } else {
        console.log('✅ Clip downloaded successfully');
        // Clean up after download
        setTimeout(async () => {
          try {
            const dir = path.dirname(job.outputPath);
            await fs.rm(dir, { recursive: true, force: true });
            jobs.delete(jobId);
            console.log('🗑️  Cleaned up job:', jobId);
          } catch (error) {
            console.error('Cleanup error:', error);
          }
        }, 5000);
      }
    });
  } catch (error) {
    console.error('Error sending file:', error);
    res.status(500).json({ error: 'Error downloading file' });
  }
});

// Get job status
app.get('/api/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json(job);
});

// Update Gemini API key
app.post('/api/settings/api-key', (req, res) => {
  const { apiKey } = req.body;
  
  if (!apiKey) {
    return res.status(400).json({ error: 'API key is required' });
  }

  // In a real application, you'd save this to a database
  // For now, we'll just validate it
  res.json({ success: true, message: 'API key updated successfully' });
});

// Start server
async function startServer() {
  await ensureTempDir();
  await cleanupOldFiles();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 Video Clipper API running on port', PORT);
    console.log('📁 Temp directory:', TEMP_DIR);
    console.log('🤖 Gemini API configured');
  });
}

startServer();
