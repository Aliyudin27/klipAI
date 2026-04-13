import ReactSlider from 'react-slider';

function VideoEditor({ duration, selectedRange, setSelectedRange, onProcess, onReset, loading }) {
  const handleSliderChange = (values) => {
    setSelectedRange(values);
  };

  const clipDuration = selectedRange[1] - selectedRange[0];
  const isValidDuration = clipDuration >= 5 && clipDuration <= 90;

  return (
    <div className="card">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">
        ✏️ Customize Your Clip
      </h2>

      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-gray-700 font-semibold">Clip Range:</span>
          <span className="text-purple-600 font-bold text-lg">
            {formatTime(selectedRange[0])} - {formatTime(selectedRange[1])} ({clipDuration.toFixed(1)}s)
          </span>
        </div>

        <div className="mb-4 px-2">
          <ReactSlider
            className="horizontal-slider"
            thumbClassName="slider-thumb"
            trackClassName="slider-track"
            value={selectedRange}
            onChange={handleSliderChange}
            min={0}
            max={duration}
            step={0.5}
            pearling
            minDistance={5}
            data-testid="clip-range-slider"
          />
        </div>

        <div className="flex justify-between text-sm text-gray-500">
          <span>0:00</span>
          <span>Duration: {formatTime(duration)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {!isValidDuration && (
        <div className="mb-4 p-3 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
          <p className="text-yellow-800 text-sm">
            ⚠️ Clip duration should be between 5 and 90 seconds for best results.
          </p>
        </div>
      )}

      <div className="bg-gray-50 p-4 rounded-lg mb-6">
        <h3 className="font-semibold text-gray-800 mb-2">🎨 Output Format:</h3>
        <ul className="text-sm text-gray-700 space-y-1">
          <li>• 9:16 Portrait format (1080x1920)</li>
          <li>• Black padding for landscape videos</li>
          <li>• Yellow captions with black outline</li>
          <li>• Optimized for social media</li>
        </ul>
      </div>

      <div className="flex gap-4">
        <button
          onClick={onProcess}
          disabled={loading || !isValidDuration}
          className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white py-3 px-6 rounded-lg font-semibold text-lg hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          data-testid="process-video-btn"
        >
          {loading ? '⏳ Processing...' : '🎥 Create Clip'}
        </button>

        <button
          onClick={onReset}
          disabled={loading}
          className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
          data-testid="reset-btn"
        >
          🔄 New Video
        </button>
      </div>
    </div>
  );
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default VideoEditor;