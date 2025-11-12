import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { processCsvFile, testSingleDomain } from './faviconFinder';

const app = express();
const PORT = process.env.PORT || 3001;

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
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

// Process CSV file and find favicons
app.post('/api/process-csv', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = await processCsvFile(req.file.path);

    // Send CSV as download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=favicons.csv');
    res.send(result);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to process CSV',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
