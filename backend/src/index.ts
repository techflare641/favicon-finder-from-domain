import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { processCsvFile, testSingleDomain, metrics } from './faviconFinder';
import { cacheService } from './cache';
import {
  register,
  collectDefaultMetrics,
  Counter,
  Histogram,
} from 'prom-client';

const app = express();
const PORT = process.env.PORT || 3001;
const httpServer = createServer(app);

// Initialize Socket.IO for real-time updates
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

// Initialize Prometheus metrics
collectDefaultMetrics();
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
});

const faviconRequestsTotal = new Counter({
  name: 'favicon_requests_total',
  help: 'Total number of favicon requests',
  labelNames: ['status'],
});

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

app.use(cors());
app.use(express.json());

// Initialize Redis cache
cacheService.connect().catch((err) => {
  console.warn('Starting without Redis cache:', err);
});

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Health check endpoint
app.get('/health', async (req, res) => {
  const cacheStats = await cacheService.getStats();
  res.json({
    status: 'ok',
    cache: cacheStats,
    uptime: process.uptime(),
  });
});

// Metrics endpoint for Prometheus
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);

    // Add custom favicon metrics
    const metricsData = {
      ...metrics,
      cacheHitRate:
        metrics.totalRequests > 0
          ? ((metrics.cacheHits / metrics.totalRequests) * 100).toFixed(2) + '%'
          : '0%',
      averageDuration:
        metrics.totalRequests > 0
          ? (metrics.totalDuration / metrics.totalRequests).toFixed(2) + 'ms'
          : '0ms',
    };

    res.end(
      (await register.metrics()) +
        `\n# Custom Favicon Metrics\n` +
        `favicon_total_requests ${metrics.totalRequests}\n` +
        `favicon_cache_hits ${metrics.cacheHits}\n` +
        `favicon_cache_misses ${metrics.cacheMisses}\n` +
        `favicon_found ${metrics.found}\n` +
        `favicon_not_found ${metrics.notFound}\n` +
        `favicon_errors ${metrics.errors}\n` +
        `favicon_total_duration_ms ${metrics.totalDuration}\n`
    );
  } catch (err) {
    res.status(500).end(err);
  }
});

// Stats endpoint (JSON format)
app.get('/api/stats', async (req, res) => {
  const cacheStats = await cacheService.getStats();
  res.json({
    metrics: {
      ...metrics,
      cacheHitRate:
        metrics.totalRequests > 0
          ? ((metrics.cacheHits / metrics.totalRequests) * 100).toFixed(2)
          : 0,
      averageDuration:
        metrics.totalRequests > 0
          ? (metrics.totalDuration / metrics.totalRequests).toFixed(2)
          : 0,
    },
    cache: cacheStats,
  });
});

// Debug endpoint: Test a single domain
app.get('/api/test-domain/:domain', async (req, res) => {
  try {
    const { domain } = req.params;

    if (!domain) {
      return res.status(400).json({ error: 'Domain parameter is required' });
    }

    const result = await testSingleDomain(domain);

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to test domain',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Debug endpoint: Test a single domain via POST (with query params)
app.post('/api/test-domain', async (req, res) => {
  try {
    const { domain } = req.body;

    if (!domain) {
      return res
        .status(400)
        .json({ error: 'Domain is required in request body' });
    }

    const result = await testSingleDomain(domain);

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to test domain',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Process CSV file and find favicons with real-time updates
app.post('/api/process-csv', upload.single('file'), async (req, res) => {
  const startTime = Date.now();

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get socket ID from query parameter if provided
    const socketId = req.query.socketId as string;
    const clientSocket = socketId ? io.sockets.sockets.get(socketId) : null;

    // Process with progress updates via WebSocket
    const result = await processCsvFile(req.file.path, (progress) => {
      if (clientSocket) {
        clientSocket.emit('progress', {
          processed: progress.processed,
          total: progress.total,
          percentage: ((progress.processed / progress.total) * 100).toFixed(1),
          lastResult: progress.result,
        });
      }

      // Track metrics
      if (progress.result.status === 'found') {
        faviconRequestsTotal.inc({ status: 'found' });
      } else if (progress.result.status === 'not_found') {
        faviconRequestsTotal.inc({ status: 'not_found' });
      } else if (progress.result.status === 'error') {
        faviconRequestsTotal.inc({ status: 'error' });
      }
    });

    const duration = Date.now() - startTime;
    httpRequestDuration.observe(
      { method: 'POST', route: '/api/process-csv', status: '200' },
      duration / 1000
    );

    // Send CSV as download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=favicons.csv');
    res.send(result);
  } catch (error) {
    const duration = Date.now() - startTime;
    httpRequestDuration.observe(
      { method: 'POST', route: '/api/process-csv', status: '500' },
      duration / 1000
    );

    res.status(500).json({
      error: 'Failed to process CSV',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

httpServer.listen(PORT, () => {
  console.log(`✓ Backend server running on http://localhost:${PORT}`);
  console.log(`✓ WebSocket server ready`);
  console.log(`✓ Metrics available at http://localhost:${PORT}/metrics`);
});
