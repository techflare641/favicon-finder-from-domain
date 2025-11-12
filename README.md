# Favicon Finder Project

A fullstack TypeScript application that processes CSV files containing domain names and finds their favicon URLs. Built with React frontend and Express backend.

## Features

- 🚀 Process 1000 domains in under 5 minutes
- 🔍 Intelligent favicon discovery (checks `/favicon.ico` and parses HTML `<link>` tags)
- ⚡ Concurrent processing with rate limiting for optimal performance
- 📊 Real-time statistics and progress tracking
- 🎨 Modern, responsive UI
- 📥 CSV upload and download functionality

## Tech Stack

**Frontend:**
- React 18 with TypeScript
- Vite (fast build tool)
- Axios for HTTP requests
- Modern CSS with responsive design

**Backend:**
- Node.js with Express
- TypeScript
- Axios for HTTP requests
- Cheerio for HTML parsing
- Multer for file uploads

## Setup Instructions

### Prerequisites

- Node.js 18+ and npm installed
- Terminal/Command Prompt

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create uploads directory:
```bash
mkdir uploads
```

4. Build the TypeScript code:
```bash
npm run build
```

5. Start the backend server:
```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

The backend will run on `http://localhost:3001`

### Frontend Setup

1. Open a new terminal and navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The frontend will run on `http://localhost:3000`

## Usage

1. Open your browser and go to `http://localhost:3000`
2. Click "Choose CSV file" and select the `favicon-finder-top-1k-domains.csv` file
3. Click "Find Favicons" to start processing
4. Wait for the process to complete (typically 2-4 minutes for 1000 domains)
5. The results will automatically download as `favicons.csv`
6. View statistics showing:
   - Total domains processed
   - Favicons found
   - Favicons not found
   - Errors encountered

## CSV Format

### Input Format
```csv
rank,domain
1,google.com
2,youtube.com
```

### Output Format
```csv
rank,domain,favicon_url,status,error
1,google.com,https://www.google.com/favicon.ico,found,
2,youtube.com,https://youtube.com/favicon.ico,found,
```

## Performance

The application uses concurrent processing with a configurable batch size (default: 50 concurrent requests) to process domains efficiently while respecting rate limits. Expected performance:

- **1000 domains**: 2-4 minutes
- **Processing rate**: 5-10 domains/second (depending on network and server response times)

## Architecture

### Favicon Discovery Strategy

1. **Direct favicon check**: Attempts to fetch `https://domain.com/favicon.ico` and `http://domain.com/favicon.ico`
2. **HTML parsing**: If direct check fails, fetches the homepage HTML and searches for:
   - `<link rel="icon">`
   - `<link rel="shortcut icon">`
   - `<link rel="apple-touch-icon">`
   - `<link rel="apple-touch-icon-precomposed">`
3. **URL resolution**: Handles relative URLs, protocol-relative URLs, and absolute URLs
4. **Verification**: Validates that discovered favicon URLs are accessible

### Error Handling

- Network timeouts (5 seconds per request)
- Invalid domains
- Unreachable servers
- Missing favicons
- All errors are logged in the output CSV

## Project Structure

```
fullstack-favicon-finder-project/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Express server setup
│   │   └── faviconFinder.ts      # Core favicon discovery logic
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx               # Main React component
│   │   ├── App.css               # Styles
│   │   ├── main.tsx              # Entry point
│   │   └── index.css             # Global styles
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── favicon-finder-top-1k-domains.csv  # Input file
├── favicons.csv                        # Output file (generated)
└── README.md
```

## Development

### Backend Development Mode

```bash
cd backend
npm run dev
```

Uses `nodemon` and `ts-node` for auto-reload on file changes.

### Frontend Development Mode

```bash
cd frontend
npm run dev
```

Vite provides hot module replacement for instant updates.

### Building for Production

**Backend:**
```bash
cd backend
npm run build
npm start
```

**Frontend:**
```bash
cd frontend
npm run build
npm run preview
```

## Configuration

### Backend Configuration

- **Port**: Set via `PORT` environment variable (default: 3001)
- **Concurrent requests**: Modify `CONCURRENT_REQUESTS` in `backend/src/faviconFinder.ts` (default: 50)
- **Request timeout**: Modify `REQUEST_TIMEOUT` in `backend/src/faviconFinder.ts` (default: 5000ms)

### Frontend Configuration

- **API URL**: Set via `VITE_API_URL` environment variable (default: http://localhost:3001)

## Trade-offs and Design Decisions

1. **Concurrent Processing**: Using 50 concurrent requests provides good performance without overwhelming target servers or the local network. This can be tuned based on network capacity.

2. **Two-Strategy Favicon Discovery**: Checking `/favicon.ico` first is faster, falling back to HTML parsing ensures better coverage.

3. **Timeout Strategy**: 5-second timeout per request balances thoroughness with performance. Slow servers are marked as errors to keep overall processing time reasonable.

4. **No External APIs**: All favicon discovery is implemented in-house as per requirements, giving full control over the logic.

5. **Simple Architecture**: Synchronous processing on the backend (client waits for full response) keeps the implementation straightforward. For larger scale, this could be replaced with a job queue system.

## Future Enhancements

Given more time, potential improvements could include:

- **Caching layer**: Redis cache for previously discovered favicons
- **WebSocket support**: Real-time progress updates during processing
- **Batch processing**: Queue system for handling multiple large files
- **Retry logic**: Automatic retries for transient failures
- **Favicon validation**: Image format verification and size checking
- **Database storage**: Persist results for historical tracking
- **Rate limiting**: Intelligent per-domain rate limiting
- **Monitoring**: Prometheus metrics for tracking success rates

## Troubleshooting

**Backend won't start:**
- Ensure port 3001 is not in use
- Check that all dependencies are installed (`npm install`)
- Verify Node.js version is 18+

**Frontend can't connect to backend:**
- Verify backend is running on port 3001
- Check browser console for CORS errors
- Ensure `VITE_API_URL` is set correctly if modified

**Processing is slow:**
- Check your internet connection
- Many domains may have slow response times
- Adjust `CONCURRENT_REQUESTS` in backend code if needed

**"No file uploaded" error:**
- Ensure you're selecting a valid CSV file
- Check that the CSV follows the correct format (rank,domain)

## License

This project is for interview purposes only.
