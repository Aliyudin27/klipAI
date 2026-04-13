function Settings({ customApiKey, setCustomApiKey }) {
  const handleSave = () => {
    alert('✅ API Key saved! It will be used for AI analysis.');
  };

  return (
    <div className="card">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">
        ⚙️ Settings
      </h2>

      <div className="mb-6">
        <label className="block text-gray-700 font-semibold mb-2">
          Gemini API Key (Optional)
        </label>
        <p className="text-sm text-gray-600 mb-3">
          Add your own Gemini API key for AI analysis. If not provided, the default key will be used.
        </p>
        <input
          type="password"
          value={customApiKey}
          onChange={(e) => setCustomApiKey(e.target.value)}
          placeholder="AIzaSy..."
          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-purple-500"
          data-testid="api-key-input"
        />
      </div>

      <button
        onClick={handleSave}
        className="bg-purple-600 text-white py-2 px-6 rounded-lg font-semibold hover:bg-purple-700 transition"
        data-testid="save-settings-btn"
      >
        💾 Save Settings
      </button>

      <div className="mt-8 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-semibold text-blue-900 mb-2">🔑 How to get your Gemini API Key:</h3>
        <ol className="text-sm text-blue-800 space-y-1 text-left list-decimal list-inside">
          <li>Visit <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="underline">Google AI Studio</a></li>
          <li>Sign in with your Google account</li>
          <li>Create a new API key</li>
          <li>Copy and paste it here</li>
        </ol>
      </div>
    </div>
  );
}

export default Settings;