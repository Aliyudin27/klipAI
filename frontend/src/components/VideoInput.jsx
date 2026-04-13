import { useState } from 'react';

function VideoInput({ onSubmit, loading }) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (url.trim()) {
      onSubmit(url.trim());
    }
  };

  return (
    <div className="card">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">
        Enter Video URL
      </h2>
      <p className="text-gray-600 mb-6">
        Supports YouTube, Vimeo, and many other platforms
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-purple-500 text-lg"
            disabled={loading}
            data-testid="video-url-input"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-3 px-6 rounded-lg font-semibold text-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          data-testid="submit-video-btn"
        >
          {loading ? '⏳ Processing...' : '🚀 Start Clipping'}
        </button>
      </form>

      <div className="mt-8 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-semibold text-blue-900 mb-2">🌟 How it works:</h3>
        <ul className="text-sm text-blue-800 space-y-1 text-left">
          <li>• Paste any video URL from supported platforms</li>
          <li>• AI analyzes the content and suggests viral clips</li>
          <li>• Customize the clip range with the slider</li>
          <li>• Download your 9:16 portrait video with captions</li>
        </ul>
      </div>
    </div>
  );
}

export default VideoInput;