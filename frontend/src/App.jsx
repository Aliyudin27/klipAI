import { useState, useRef } from 'react'
import './App.css'
import VideoInput from './components/VideoInput'
import AISuggestions from './components/AISuggestions'
import VideoEditor from './components/VideoEditor'
import Settings from './components/Settings'
import axios from 'axios'

// FIXED: Strictly use localhost:8001 for local development
const API_URL = 'http://localhost:8001';

// Configure axios with 5 minute timeout
axios.defaults.timeout = 300000; // 5 minutes

function App() {
  const [currentView, setCurrentView] = useState('home'); // home, settings
  const [jobId, setJobId] = useState(null);
  const [videoData, setVideoData] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedRange, setSelectedRange] = useState([0, 60]);
  const [customApiKey, setCustomApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  
  // Use ref to store interval ID for proper cleanup
  const pollingIntervalRef = useRef(null);
  const timeoutRef = useRef(null);

  // Clear all intervals and timeouts
  const clearAllTimers = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  // Handle video URL submission with FIXED polling logic
  const handleVideoSubmit = async (url) => {
    setLoading(true);
    setError('');
    setWarning('');
    clearAllTimers(); // Clear any existing timers
    
    try {
      // Start download
      const response = await axios.post(`${API_URL}/api/download`, { url });
      const newJobId = response.data.jobId;
      setJobId(newJobId);

      // Poll for completion - FIXED: stops immediately on error
      pollingIntervalRef.current = setInterval(async () => {
        try {
          const statusResponse = await axios.get(`${API_URL}/api/status/${newJobId}`);
          const status = statusResponse.data;

          if (status.status === 'completed') {
            // Success - stop polling and analyze
            clearAllTimers();
            setVideoData(status);
            setSelectedRange([0, Math.min(60, status.duration)]);
            
            // Automatically analyze with AI
            await analyzeVideo(newJobId);
          } else if (status.status === 'error') {
            // Error - STOP IMMEDIATELY
            clearAllTimers();
            setError(status.message || 'Download failed');
            setLoading(false);
          }
          // If status is 'downloading' or 'extracting', continue polling
        } catch (pollError) {
          // Network error during polling - stop and show error
          clearAllTimers();
          setError('Lost connection to server. Please try again.');
          setLoading(false);
        }
      }, 2000); // Poll every 2 seconds

      // INCREASED timeout to 5 minutes for longer videos
      timeoutRef.current = setTimeout(() => {
        clearAllTimers();
        setError('Download timeout after 5 minutes. Please try a shorter video.');
        setLoading(false);
      }, 300000); // 5 minutes

    } catch (err) {
      clearAllTimers();
      setError(err.response?.data?.error || err.message || 'Failed to start download');
      setLoading(false);
    }
  };

  // Analyze video with AI - with proper error handling
  const analyzeVideo = async (jId) => {
    try {
      const response = await axios.post(`${API_URL}/api/analyze`, {
        jobId: jId || jobId,
        customApiKey
      });
      
      setSuggestions(response.data.suggestions);
      
      // Show warning if AI analysis failed
      if (response.data.warning) {
        setWarning(response.data.warning);
      }
      
      // Auto-select first suggestion
      if (response.data.suggestions.length > 0) {
        const first = response.data.suggestions[0];
        setSelectedRange([first.start, first.end]);
      }
      
      setLoading(false);
    } catch (err) {
      // Even if AI analysis fails, we should have fallback suggestions
      setWarning('AI analysis failed. Using default time-based suggestions.');
      
      // Generate basic fallback suggestions
      if (videoData && videoData.duration) {
        const fallbackSuggestions = [{
          start: 0,
          end: Math.min(60, videoData.duration),
          duration: Math.min(60, videoData.duration),
          reason: 'Default suggestion - opening segment'
        }];
        setSuggestions(fallbackSuggestions);
        setSelectedRange([0, Math.min(60, videoData.duration)]);
      }
      
      setLoading(false);
    }
  };

  // Process video with proper timeout handling
  const handleProcess = async () => {
    setLoading(true);
    setError('');
    setWarning('');
    
    try {
      const response = await axios.post(`${API_URL}/api/process`, {
        jobId,
        startTime: selectedRange[0],
        endTime: selectedRange[1]
      }, {
        timeout: 300000 // 5 minute timeout for processing
      });

      if (response.data.success) {
        // Download the processed video
        window.location.href = `${API_URL}${response.data.downloadUrl}`;
        
        // Show success message
        setWarning('Video processed! Download should start automatically.');
      }
      
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Processing failed');
      setLoading(false);
    }
  };

  // Select a suggestion
  const handleSelectSuggestion = (suggestion) => {
    setSelectedRange([suggestion.start, suggestion.end]);
  };

  // Reset to start over - FIXED: clear all timers
  const handleReset = () => {
    clearAllTimers(); // Important: clear any running timers
    setJobId(null);
    setVideoData(null);
    setSuggestions([]);
    setSelectedRange([0, 60]);
    setError('');
    setWarning('');
    setLoading(false);
  };

  return (
    <div className="App">
      {/* Header */}
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-white flex items-center gap-3">
            <span className="text-5xl">🎬</span>
            AI Video Clipper
          </h1>
          <button
            onClick={() => setCurrentView(currentView === 'home' ? 'settings' : 'home')}
            className="bg-white text-purple-600 px-6 py-2 rounded-lg font-semibold hover:bg-purple-50 transition"
          >
            {currentView === 'home' ? '⚙️ Settings' : '🏠 Home'}
          </button>
        </div>

        {/* Settings View */}
        {currentView === 'settings' && (
          <Settings 
            customApiKey={customApiKey}
            setCustomApiKey={setCustomApiKey}
          />
        )}

        {/* Main View */}
        {currentView === 'home' && (
          <>
            {/* Error Message */}
            {error && (
              <div className="card bg-red-50 border-2 border-red-300">
                <p className="text-red-700 font-semibold">❌ {error}</p>
                <button 
                  onClick={() => setError('')}
                  className="mt-2 text-sm text-red-600 underline"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Warning Message */}
            {warning && (
              <div className="card bg-yellow-50 border-2 border-yellow-300">
                <p className="text-yellow-700 font-semibold">⚠️ {warning}</p>
                <button 
                  onClick={() => setWarning('')}
                  className="mt-2 text-sm text-yellow-600 underline"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Video Input */}
            {!videoData && (
              <VideoInput 
                onSubmit={handleVideoSubmit}
                loading={loading}
              />
            )}

            {/* Loading State */}
            {loading && !videoData && (
              <div className="card">
                <div className="loading-spinner"></div>
                <p className="text-gray-600 mt-4">Processing your video...</p>
                <p className="text-sm text-gray-500 mt-2">This may take a few minutes for longer videos</p>
              </div>
            )}

            {/* AI Suggestions */}
            {videoData && suggestions.length > 0 && (
              <AISuggestions 
                suggestions={suggestions}
                onSelect={handleSelectSuggestion}
                selectedRange={selectedRange}
              />
            )}

            {/* Video Editor */}
            {videoData && (
              <VideoEditor 
                duration={videoData.duration}
                selectedRange={selectedRange}
                setSelectedRange={setSelectedRange}
                onProcess={handleProcess}
                onReset={handleReset}
                loading={loading}
              />
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="text-center text-white mt-12 pb-8">
        <p className="text-sm opacity-75">Powered by AI • yt-dlp • FFmpeg</p>
        <p className="text-xs opacity-60 mt-1">API: {API_URL}</p>
      </div>
    </div>
  );
}

export default App;
