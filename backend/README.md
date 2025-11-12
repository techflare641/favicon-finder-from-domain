# Favicon Finder Backend

Express/TypeScript backend service for finding favicon URLs from domains.

## Setup

```bash
npm install
npm run build
npm start
```

## Development

```bash
npm run dev
```

## 🧪 Testing & Debugging

### Test a Single Domain

The easiest way to test and debug favicon finding for a specific domain:

```bash
# Test google.com
npm run test:domain google.com

# Test multiple domains
npm run test:domain google.com youtube.com facebook.com
```

This will show detailed debug logs including:
- HTTP requests made
- HTML selectors tried
- URLs found and parsed
- Final result and duration

### Using the Debug API Endpoint

When the server is running, you can also test via HTTP:

```bash
# GET request
curl http://localhost:3001/api/test-domain/google.com

# POST request
curl -X POST http://localhost:3001/api/test-domain \
  -H "Content-Type: application/json" \
  -d '{"domain": "google.com"}'

# Or in your browser
http://localhost:3001/api/test-domain/google.com
```

**Response format:**
```json
{
  "success": true,
  "result": {
    "domain": "google.com",
    "favicon_url": "https://www.gstatic.com/images/branding/searchlogo/ico/favicon.ico",
    "status": "found",
    "duration_ms": 1234
  }
}
```

### Debug Output Example

```
================================================================================
Testing domain: google.com
================================================================================
[DEBUG google.com] Trying protocol: https
[DEBUG google.com] Fetching HTML from: https://google.com
[DEBUG google.com] HTML fetched successfully, status: 200
[DEBUG google.com] Base URL: https://www.google.com/
[DEBUG google.com] Searching for favicon in HTML with 9 selectors
[DEBUG google.com] Selector "link[rel="icon"]" found 1 elements
[DEBUG google.com]   Element 0: href/content = "//www.gstatic.com/images/branding/searchlogo/ico/favicon.ico"
[DEBUG google.com]   Converted protocol-relative: https://www.gstatic.com/images/branding/searchlogo/ico/favicon.ico
[DEBUG google.com] ✓ Found favicon URL: https://www.gstatic.com/images/branding/searchlogo/ico/favicon.ico
================================================================================
Result: https://www.gstatic.com/images/branding/searchlogo/ico/favicon.ico
Duration: 1234ms
================================================================================
```

For more details, see [DEBUG.md](./DEBUG.md)

## API Endpoints

### POST /api/process-csv

Upload a CSV file with domains and receive a CSV with favicon URLs.

**Request:**
- Content-Type: multipart/form-data
- Body: file (CSV file)

**Response:**
- Content-Type: text/csv
- Body: CSV with columns: rank, domain, favicon_url, status, error

### GET /api/test-domain/:domain

Test favicon finding for a single domain (debug endpoint).

**Request:**
- URL parameter: domain (e.g., `google.com`)

**Response:**
```json
{
  "success": true,
  "result": {
    "domain": "google.com",
    "favicon_url": "https://www.google.com/favicon.ico",
    "status": "found",
    "duration_ms": 1234
  }
}
```

### POST /api/test-domain

Test favicon finding for a single domain (debug endpoint, POST version).

**Request:**
```json
{
  "domain": "google.com"
}
```

**Response:**
Same as GET version above.

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok"
}
```

## Configuration

- `PORT`: Server port (default: 3001)
- `CONCURRENT_REQUESTS`: Number of concurrent favicon lookups (default: 50)
- `REQUEST_TIMEOUT`: Timeout for HTTP requests in ms (default: 6000)

## Architecture & Best Practices

### Favicon Discovery Strategy

1. **HTML Parsing (Primary)**: Fetches the homepage and looks for `<link>` tags
   - Supports: `rel="icon"`, `rel="shortcut icon"`, `rel="apple-touch-icon"`, etc.
   - Handles: Open Graph images, Microsoft tile images

2. **Fallback to /favicon.ico**: If HTML parsing fails or finds nothing
   - Tries: `https://domain.com/favicon.ico` and `http://domain.com/favicon.ico`

3. **URL Resolution**: Handles various URL formats
   - Protocol-relative: `//cdn.example.com/icon.png`
   - Absolute path: `/images/icon.png`
   - Relative path: `img/icon.png`
   - Absolute URL: `https://cdn.example.com/icon.png`

### Code Organization

```
backend/
├── src/
│   ├── index.ts              # Express server with API endpoints
│   ├── faviconFinder.ts      # Core favicon finding logic
│   └── test-single-domain.ts # Standalone test script
├── DEBUG.md                  # Detailed debugging guide
└── README.md                 # This file
```

### Design Patterns

- **Separation of Concerns**: Favicon logic separate from HTTP layer
- **Strategy Pattern**: Multiple favicon discovery strategies with fallbacks
- **Error Handling**: Comprehensive try-catch blocks with graceful degradation
- **Performance**: Concurrent processing with configurable batch sizes
- **Testability**: Exported functions with debug mode

### Key Features

✅ TypeScript for type safety  
✅ Comprehensive error handling  
✅ Detailed debug logging  
✅ Multiple favicon discovery strategies  
✅ Protocol-relative URL support  
✅ Concurrent request processing  
✅ Configurable timeouts and batch sizes  
✅ Debug API endpoints for testing  
✅ Standalone test script

