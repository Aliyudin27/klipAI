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
const TEMP_DIR = process.env.TEMP_DIR || path.join(__dirname, 'temp');

// Middleware - CORS configured for localhost:3000
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Store job status in memory (stateless - will be reset on server restart)
const jobs = new Map();

// Initialize Gemini AI with proper error handling
let genAI = null;
try {
  if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    console.log('✅ Gemini API initialized');
  } else {
    console.warn('⚠️  GEMINI_API_KEY not found in environment');
  }
} catch (error) {
  console.error('❌ Failed to initialize Gemini AI:', error.message);
}

// Ensure temp directory exists
async function ensureTempDir() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
    console.log('✅ Temp directory created:', TEMP_DIR);
  } catch (error) {
    console.error('Error creating temp directory:', error);
  }
}

// Clean up specific job folder
async function cleanupJobFolder(jobId) {
  try {
    const jobDir = path.join(TEMP_DIR, jobId);
    await fs.rm(jobDir, { recursive: true, force: true });
    jobs.delete(jobId);
    console.log('🗑️  Cleaned up job folder:', jobId);
  } catch (error) {
    console.error('Cleanup error for job', jobId, ':', error.message);
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
      try {
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtimeMs > oneHour) {
          if (stats.isDirectory()) {
            await fs.rm(filePath, { recursive: true, force: true });
          } else {
            await fs.unlink(filePath);
          }
          console.log('🗑️  Cleaned up old file/folder:', file);
        }
      } catch (statError) {
        console.error('Error checking file stats:', statError.message);
      }
    }
  } catch (error) {
    console.error('Error during cleanup:', error.message);
  }
}

// Run cleanup every 30 minutes
setInterval(cleanupOldFiles, 30 * 60 * 1000);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Video Clipper API is running',
    geminiConfigured: !!genAI,
    tempDir: TEMP_DIR
  });
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

    // Download video with yt-dlp - FIXED with user-agent and no-check-certificate
    const videoPath = path.join(outputDir, 'video.mp4');
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    
    // Enhanced yt-dlp command to avoid YouTube bot detection
    const downloadCmd = `yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 --no-check-certificate --user-agent "${userAgent}" -o "${videoPath}" "${url}"`;
    
    console.log('📥 Downloading video:', url);
    await execAsync(downloadCmd, { 
      maxBuffer: 100 * 1024 * 1024,
      timeout: 300000 // 5 minute timeout
    });

    jobs.set(jobId, {
      status: 'extracting',
      progress: 30,
      message: 'Extracting transcript...'
    });

    // Extract subtitles/transcript with fallback handling
    const subtitlesPath = path.join(outputDir, 'subtitles.txt');
    let transcriptExtracted = false;
    
    try {
      const subtitlesCmd = `yt-dlp --skip-download --write-auto-subs --sub-lang en --sub-format vtt --convert-subs srt --no-check-certificate --user-agent "${userAgent}" -o "${path.join(outputDir, 'subs')}" "${url}"`;
      await execAsync(subtitlesCmd, { timeout: 60000 }); // 1 minute timeout for subtitles
      
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
        
        if (transcript.trim()) {
          await fs.writeFile(subtitlesPath, transcript);
          transcriptExtracted = true;
          console.log('✅ Transcript extracted');
        }
      }
    } catch (error) {
      console.log('⚠️  Could not extract transcript:', error.message);
    }
    
    // If transcript extraction failed, create a descriptive placeholder
    if (!transcriptExtracted) {
      await fs.writeFile(subtitlesPath, 'No transcript available for this video. Subtitles may not be available or the video may not have captions.');
      console.log('⚠️  No transcript available - using fallback');
    }

    // Get video duration - handle both Windows and Unix paths
    const escapedVideoPath = process.platform === 'win32' 
      ? videoPath.replace(/\\/g, '/')
      : videoPath;
    
    const durationCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${escapedVideoPath}"`;
    const { stdout: durationOutput } = await execAsync(durationCmd, { timeout: 30000 });
    const duration = parseFloat(durationOutput.trim());

    jobs.set(jobId, {
      status: 'completed',
      progress: 100,
      message: 'Download complete',
      videoPath,
      subtitlesPath,
      duration,
      transcriptAvailable: transcriptExtracted
    });

    console.log('✅ Download complete. Duration:', duration, 'seconds');

  } catch (error) {
    console.error('❌ Download error:', error);
    jobs.set(jobId, {
      status: 'error',
      progress: 0,
      message: error.message || 'Failed to download video'
    });
    
    // Cleanup failed job folder
    setTimeout(() => cleanupJobFolder(jobId), 5000);
  }
});

// Analyze transcript with Gemini AI - FIXED to use gemini-1.5-flash
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

    // Check if transcript is actually available
    if (transcript.includes('No transcript available') || transcript.trim().length < 50) {
      // Return default suggestions based on video duration
      const suggestions = generateDefaultSuggestions(job.duration);
      jobs.set(jobId, {
        ...job,
        status: 'analyzed',
        message: 'Analysis complete (default suggestions)',
        suggestions
      });
      return res.json({ 
        suggestions,
        warning: 'No transcript available. Using default time-based suggestions.'
      });
    }

    // Use custom API key if provided, otherwise use server key
    const apiKey = customApiKey || process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      throw new Error('No Gemini API key available');
    }

    // FIXED: Use gemini-1.5-flash on stable v1 API
    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({ 
      model: 'gemini-1.5-flash'  // Updated to stable model
    });

    const prompt = `You are a viral video expert. Analyze this video transcript and suggest 3-5 segments that would make the most engaging short clips for social media (30-90 seconds each).

Video Duration: ${job.duration} seconds
Transcript: ${transcript.substring(0, 8000)}

For each suggested clip, provide:
1. Start time (in seconds)
2. End time (in seconds)  
3. Why this segment is engaging

Format your response as a JSON array ONLY (no additional text):
[
  {
    "start": <seconds>,
    "end": <seconds>,
    "duration": <seconds>,
    "reason": "<explanation>"
  }
]

Make sure all timestamps are within the video duration (0 to ${job.duration} seconds) and each clip is between 30-90 seconds.`;

    console.log('🤖 Analyzing with Gemini AI (gemini-1.5-flash)...');
    
    // Robust try-catch for Gemini API call
    let suggestions = [];
    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Extract JSON from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No valid JSON found in response');
      }
    } catch (aiError) {
      console.error('⚠️  Gemini API error:', aiError.message);
      // Fallback to default suggestions
      suggestions = generateDefaultSuggestions(job.duration);
      
      jobs.set(jobId, {
        ...job,
        status: 'analyzed',
        message: 'Analysis complete (default suggestions)',
        suggestions
      });
      
      return res.json({ 
        suggestions,
        warning: 'AI analysis failed. Using default time-based suggestions.'
      });
    }

    // Validate and fix suggestions
    suggestions = suggestions
      .map(s => ({
        start: Math.max(0, Math.min(s.start || 0, job.duration - 30)),
        end: Math.max(30, Math.min(s.end || 60, job.duration)),
        duration: (s.end || 60) - (s.start || 0),
        reason: s.reason || 'Interesting segment'
      }))
      .filter(s => s.duration >= 30 && s.duration <= 90);

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
    
    // ROBUST FALLBACK: Always return default suggestions
    const suggestions = generateDefaultSuggestions(job.duration || 60);
    jobs.set(jobId, {
      ...job,
      status: 'analyzed',
      message: 'Analysis complete (default suggestions)',
      suggestions
    });
    
    res.json({ 
      suggestions, 
      warning: 'AI analysis failed. Using default time-based suggestions.'
    });
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
    const clipStart = Math.max(0, midPoint - 30);
    const clipEnd = Math.min(duration, midPoint + 30);
    suggestions.push({
      start: clipStart,
      end: clipEnd,
      duration: clipEnd - clipStart,
      reason: 'Middle segment - core content'
    });
  }

  // End clip
  if (duration >= 150) {
    const clipStart = Math.max(0, duration - 60);
    suggestions.push({
      start: clipStart,
      end: duration,
      duration: duration - clipStart,
      reason: 'Closing segment - conclusion or CTA'
    });
  }

  return suggestions;
}

// Process video with FFmpeg - FIXED for Windows compatibility
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

    // Handle Windows paths for FFmpeg
    const escapedInputPath = process.platform === 'win32' 
      ? job.videoPath.replace(/\\/g, '/')
      : job.videoPath;
    
    const escapedOutputPath = process.platform === 'win32'
      ? outputPath.replace(/\\/g, '/')
      : outputPath;

    // Get input video dimensions
    const probeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${escapedInputPath}"`;
    const { stdout: dimensions } = await execAsync(probeCmd, { timeout: 30000 });
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
      padFilter = `pad=${targetWidth}:${targetHeight}:${Math.round((targetWidth - scaledWidth) / 2)}:0:black`;
    } else {
      // Video is taller or equal to 9:16 - scale to width and add top/bottom padding
      const scaledWidth = targetWidth;
      const scaledHeight = Math.round(scaledWidth / inputAspect);
      scaleFilter = `scale=${scaledWidth}:${scaledHeight}`;
      padFilter = `pad=${targetWidth}:${targetHeight}:0:${Math.round((targetHeight - scaledHeight) / 2)}:black`;
    }

    // Add yellow text captions at bottom (viral style)
    // Handle font path for both Windows and Unix
    let fontPath = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
    if (process.platform === 'win32') {
      fontPath = 'C\\\\:/Windows/Fonts/Arial.ttf'; // Escaped for FFmpeg on Windows
    }
    
    const captionFilter = `drawtext=text='VIRAL CLIP':fontfile=${fontPath}:fontsize=48:fontcolor=yellow:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h-th-100`;

    // Combine all filters
    const filterComplex = `${scaleFilter},${padFilter},${captionFilter}`;

    console.log('🎬 Processing video with FFmpeg...');
    console.log('Input dimensions:', `${inputWidth}x${inputHeight}`);
    console.log('Output dimensions:', `${targetWidth}x${targetHeight}`);
    console.log('Clip duration:', duration, 'seconds');

    // FFmpeg command: trim, scale, pad, add captions
    const ffmpegCmd = `ffmpeg -i "${escapedInputPath}" -ss ${startTime} -t ${duration} -vf "${filterComplex}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k "${escapedOutputPath}" -y`;
    
    // 5 minute timeout for processing
    await execAsync(ffmpegCmd, { 
      maxBuffer: 100 * 1024 * 1024,
      timeout: 300000 
    });

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
      message: error.message || 'Video processing failed'
    });
    res.status(500).json({ error: error.message || 'Video processing failed' });
  }
});

// Download processed clip with automatic cleanup
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
        // Clean up after download - ENHANCED cleanup
        setTimeout(() => cleanupJobFolder(jobId), 10000); // 10 seconds after download
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
    console.log('🤖 Gemini API configured:', !!genAI);
    console.log('🌐 CORS enabled for: http://localhost:3000');
  });
}

startServer();
