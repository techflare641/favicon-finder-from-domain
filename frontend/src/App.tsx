import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Stats {
  total: number;
  found: number;
  notFound: number;
  errors: number;
}

interface FaviconResult {
  rank: number;
  domain: string;
  favicon_url: string;
  status: string;
  error?: string;
}

interface ProgressData {
  processed: number;
  total: number;
  percentage: string;
  lastResult: FaviconResult;
}

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [processingTime, setProcessingTime] = useState<number | null>(null);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [recentFavicons, setRecentFavicons] = useState<FaviconResult[]>([]);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Initialize Socket.IO connection
    const socket = io(API_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('WebSocket connected:', socket.id);
    });

    socket.on('progress', (data: ProgressData) => {
      setProgress(data);

      // Add to recent favicons if found
      if (data.lastResult.status === 'found' && data.lastResult.favicon_url) {
        setRecentFavicons((prev) => {
          const updated = [data.lastResult, ...prev].slice(0, 20); // Keep last 20
          return updated;
        });
      }
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        setError('Please select a CSV file');
        return;
      }
      setFile(selectedFile);
      setError(null);
      setStats(null);
      setProcessingTime(null);
      setProgress(null);
      setRecentFavicons([]);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!file) {
      setError('Please select a file');
      return;
    }

    setLoading(true);
    setError(null);
    setStats(null);
    setProgress(null);
    setRecentFavicons([]);

    const formData = new FormData();
    formData.append('file', file);

    const startTime = Date.now();

    try {
      // Pass socket ID to enable real-time updates
      const socketId = socketRef.current?.id || '';

      const response = await axios.post(
        `${API_URL}/api/process-csv?socketId=${socketId}`,
        formData,
        {
          responseType: 'blob',
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      const duration = (Date.now() - startTime) / 1000;
      setProcessingTime(duration);

      // Parse CSV to get statistics
      const text = await response.data.text();
      const lines = text.trim().split('\n');
      const dataLines = lines.slice(1); // Skip header

      let found = 0;
      let notFound = 0;
      let errors = 0;

      dataLines.forEach((line: string) => {
        if (line.includes(',found,') || line.includes(',"found"')) {
          found++;
        } else if (
          line.includes(',not_found,') ||
          line.includes(',"not_found"')
        ) {
          notFound++;
        } else if (line.includes(',error,') || line.includes(',"error"')) {
          errors++;
        }
      });

      setStats({
        total: dataLines.length,
        found,
        notFound,
        errors,
      });

      // Download the file
      const blob = new Blob([text], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'favicons.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(
        axios.isAxiosError(err) && err.response?.data
          ? 'Failed to process CSV file. Please check the server logs.'
          : 'An error occurred while processing the file.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <h1>Favicon Finder</h1>
          <p className="subtitle">
            Upload a CSV file with domains to find their favicon URLs
          </p>
        </header>

        <form onSubmit={handleSubmit} className="form">
          <div className="file-input-container">
            <input
              type="file"
              id="file-input"
              accept=".csv"
              onChange={handleFileChange}
              disabled={loading}
              className="file-input"
            />
            <label htmlFor="file-input" className="file-label">
              {file ? file.name : 'Choose CSV file'}
            </label>
          </div>

          <button
            type="submit"
            disabled={!file || loading}
            className="submit-button"
          >
            {loading ? 'Processing...' : 'Find Favicons'}
          </button>
        </form>

        {loading && progress && (
          <div className="progress-section">
            <div className="progress-header">
              <h2>Processing Domains...</h2>
              <div className="progress-percentage">{progress.percentage}%</div>
            </div>

            <div className="progress-bar-container">
              <div
                className="progress-bar"
                style={{ width: `${progress.percentage}%` }}
              ></div>
            </div>

            <div className="progress-stats">
              <div className="progress-stat">
                <span className="label">Processed:</span>
                <span className="value">
                  {progress.processed} / {progress.total}
                </span>
              </div>
              <div className="progress-stat">
                <span className="label">Rate:</span>
                <span className="value">
                  {progress.processed > 0
                    ? (
                        (progress.processed /
                          ((Date.now() - Date.now()) / 1000 || 1)) *
                        1
                      ).toFixed(1)
                    : '0'}{' '}
                  domains/sec
                </span>
              </div>
            </div>

            {recentFavicons.length > 0 && (
              <div className="recent-favicons">
                <h3>Recently Found Favicons</h3>
                <div className="favicon-grid">
                  {recentFavicons.slice(0, 12).map((result, idx) => (
                    <div
                      key={`${result.domain}-${idx}`}
                      className="favicon-item"
                    >
                      <img
                        src={result.favicon_url}
                        alt={result.domain}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <span className="favicon-domain" title={result.domain}>
                        {result.domain}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {loading && !progress && (
          <div className="status">
            <div className="spinner"></div>
            <p>Initializing... This may take a moment.</p>
          </div>
        )}

        {error && (
          <div className="error">
            <p>{error}</p>
          </div>
        )}

        {stats && (
          <div className="results">
            <h2>Results</h2>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{stats.total}</div>
                <div className="stat-label">Total Domains</div>
              </div>
              <div className="stat-card success">
                <div className="stat-value">{stats.found}</div>
                <div className="stat-label">Found</div>
              </div>
              <div className="stat-card warning">
                <div className="stat-value">{stats.notFound}</div>
                <div className="stat-label">Not Found</div>
              </div>
              <div className="stat-card error-card">
                <div className="stat-value">{stats.errors}</div>
                <div className="stat-label">Errors</div>
              </div>
            </div>
            {processingTime && (
              <p className="processing-time">
                Processed in {processingTime.toFixed(2)} seconds (
                {(stats.total / processingTime).toFixed(1)} domains/second)
              </p>
            )}
            <p className="success-message">
              ✓ Results downloaded as favicons.csv
            </p>
          </div>
        )}

        <div className="instructions">
          <h3>Instructions</h3>
          <ol>
            <li>
              Upload a CSV file with domains (two columns: rank, domain; no
              header row)
            </li>
            <li>Click "Find Favicons" to process</li>
            <li>Download the results CSV with favicon URLs</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

export default App;
