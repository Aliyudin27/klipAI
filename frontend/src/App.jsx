import { useState } from 'react'
import './App.css'
import VideoInput from './components/VideoInput'
import AIsuggestions from './components/AISuggestions'
import VideoEditor from './components/VideoEditor'
import Settings from './components/Settings'
import axios from 'axios'

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001';

function App() {
  const [currentView, setCurrentView] = useState('home'); // home, settings
  const [jobId, setJobId] = useState(null);
  const [videoData, setVideoData] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedRange, setSelectedRange] = useState([0, 60]);
  const [customApiKey, setCustomApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Handle video URL submission
  const handleVideoSubmit = async (url) => {
    setLoading(true);
    setError('');
    
    try {
      // Start download
      const response = await axios.post(`${API_URL}/api/download`, { url });
      const newJobId = response.data.jobId;
      setJobId(newJobId);

      // Poll for completion
      const checkStatus = setInterval(async () => {
        const statusResponse = await axios.get(`${API_URL}/api/status/${newJobId}`);
        const status = statusResponse.data;

        if (status.status === 'completed') {
          clearInterval(checkStatus);
          setVideoData(status);
          setSelectedRange([0, Math.min(60, status.duration)]);
          
          // Automatically analyze with AI
          await analyzeVideo(newJobId);
        } else if (status.status === 'error') {
          clearInterval(checkStatus);
          setError(status.message);
          setLoading(false);
        }
      }, 2000);

      // Timeout after 2 minutes
      setTimeout(() => {
        clearInterval(checkStatus);
        if (loading) {
          setError('Download timeout. Please try a shorter video.');
          setLoading(false);
        }
      }, 120000);

    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setLoading(false);
    }
  };

  // Analyze video with AI
  const analyzeVideo = async (jId) => {
    try {
      const response = await axios.post(`${API_URL}/api/analyze`, {
        jobId: jId || jobId,
        customApiKey
      });
      setSuggestions(response.data.suggestions);
      
      // Auto-select first suggestion
      if (response.data.suggestions.length > 0) {
        const first = response.data.suggestions[0];
        setSelectedRange([first.start, first.end]);
      }
      
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.error || 'AI analysis failed');
      setLoading(false);
    }
  };

  // Process video
  const handleProcess = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await axios.post(`${API_URL}/api/process`, {
        jobId,
        startTime: selectedRange[0],
        endTime: selectedRange[1]
      });

      if (response.data.success) {
        // Download the processed video
        window.location.href = `${API_URL}${response.data.downloadUrl}`;
      }
      
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Processing failed');
      setLoading(false);
    }
  };

  // Select a suggestion
  const handleSelectSuggestion = (suggestion) => {
    setSelectedRange([suggestion.start, suggestion.end]);
  };

  // Reset to start over
  const handleReset = () => {
    setJobId(null);
    setVideoData(null);
    setSuggestions([]);
    setSelectedRange([0, 60]);
    setError('');
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
      </div>
    </div>
  );
}

export default App;