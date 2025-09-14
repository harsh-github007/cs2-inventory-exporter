'use client';

import { useState } from 'react';

export default function HomePage() {
  const [profileUrl, setProfileUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMessage('');

    if (!profileUrl) {
      setError('Please enter a Steam profile URL.');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/get-inventory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ profileUrl }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Something went wrong on the server.');
      }

      const contentDisposition = response.headers.get('content-disposition');
      let fileName = 'cs2_inventory.csv';
      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename="(.+)"/);
        if (fileNameMatch && fileNameMatch.length === 2) {
          fileName = fileNameMatch[1];
        }
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      setSuccessMessage(`Successfully downloaded ${fileName}!`);

    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-900 text-white p-6 sm:p-8">
      <div className="w-full max-w-2xl text-center">
        <h1 className="text-4xl sm:text-5xl font-bold mb-3 bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
            CS2 Inventory Exporter
        </h1>
        <p className="text-gray-400 mb-8 max-w-md mx-auto">
            Enter a public Steam profile URL to download its CS2 inventory as a CSV file.
        </p>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            value={profileUrl}
            onChange={(e) => setProfileUrl(e.target.value)}
            placeholder="e.g., https://steamcommunity.com/id/your-custom-id"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
            disabled={isLoading}
          />
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 disabled:bg-gray-600 disabled:cursor-not-allowed transform hover:scale-105 disabled:transform-none"
            disabled={isLoading}
          >
            {isLoading ? 'Generating CSV...' : 'Export Inventory'}
          </button>
        </form>

        {error && (
          <p className="text-red-400 mt-4 bg-red-900/30 border border-red-500/50 rounded-lg p-3 animate-pulse">
            Error: {error}
          </p>
        )}
         {successMessage && (
          <p className="text-green-400 mt-4 bg-green-900/30 border border-green-500/50 rounded-lg p-3">
            {successMessage}
          </p>
        )}
      </div>
      <footer className="absolute bottom-4 text-gray-600 text-sm">
        Built for Vercel Deployment
      </footer>
    </main>
  );
}
