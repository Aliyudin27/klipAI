function AISuggestions({ suggestions, onSelect, selectedRange }) {
  return (
    <div className="card">
      <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
        <span>🤖</span>
        AI Suggestions
      </h2>
      <p className="text-gray-600 mb-6">
        Our AI found these engaging moments. Click to select:
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {suggestions.map((suggestion, index) => {
          const isSelected = selectedRange[0] === suggestion.start && selectedRange[1] === suggestion.end;
          
          return (
            <div
              key={index}
              onClick={() => onSelect(suggestion)}
              className={`suggestion-card p-4 rounded-lg border-2 ${
                isSelected 
                  ? 'border-purple-500 bg-purple-50' 
                  : 'border-gray-200 bg-white hover:border-purple-300'
              }`}
              data-testid={`suggestion-${index}`}
            >
              <div className="flex items-start justify-between mb-2">
                <span className="text-2xl">🎬</span>
                <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-semibold">
                  {suggestion.duration}s
                </span>
              </div>
              
              <div className="text-left">
                <div className="text-sm text-gray-600 mb-2">
                  <span className="font-semibold">Time:</span> {formatTime(suggestion.start)} - {formatTime(suggestion.end)}
                </div>
                <p className="text-sm text-gray-700">{suggestion.reason}</p>
              </div>
              
              {isSelected && (
                <div className="mt-3 text-purple-600 font-semibold text-sm">
                  ✅ Selected
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default AISuggestions;