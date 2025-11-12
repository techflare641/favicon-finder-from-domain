import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import { cacheService } from './cache';

interface DomainRecord {
  rank: number;
  domain: string;
}

interface FaviconResult {
  rank: number;
  domain: string;
  favicon_url: string;
  status: string;
  error?: string;
}

// Concurrent request limit for performance
const CONCURRENT_REQUESTS = 100; // Increased from 50
const REQUEST_TIMEOUT = 5000; // Reduced to 5 seconds
const MAX_RESPONSE_SIZE = 512 * 1024; // 512KB max for HTML (stop downloading after this)

// Create axios instance with connection pooling for better performance
const axiosInstance: AxiosInstance = axios.create({
  timeout: REQUEST_TIMEOUT,
  maxRedirects: 3, // Reduced from 5
  httpAgent: new http.Agent({
    keepAlive: true,
    maxSockets: CONCURRENT_REQUESTS,
    maxFreeSockets: 10,
    timeout: REQUEST_TIMEOUT,
  }),
  httpsAgent: new https.Agent({
    keepAlive: true,
    maxSockets: CONCURRENT_REQUESTS,
    maxFreeSockets: 10,
    timeout: REQUEST_TIMEOUT,
  }),
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
});

// Metrics tracking
export const metrics = {
  totalRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  found: 0,
  notFound: 0,
  errors: 0,
  totalDuration: 0,
};

/**
 * Find favicon for a single domain - OPTIMIZED with caching
 * Strategy: Check cache FIRST, then /favicon.ico, then parse HTML if needed
 */
async function findFavicon(domain: string): Promise<string | null> {
  metrics.totalRequests++;
  const startTime = Date.now();

  try {
    // Check cache first
    const cached = await cacheService.get(domain);
    if (cached) {
      metrics.cacheHits++;
      if (cached === 'NOT_FOUND') {
        metrics.notFound++;
        return null;
      }
      metrics.found++;
      return cached;
    }
    metrics.cacheMisses++;

    const protocols = ['https', 'http'];

    for (const protocol of protocols) {
      // Strategy 1: Try /favicon.ico FIRST (fastest, covers ~80% of cases)
      try {
        const faviconUrl = `${protocol}://${domain}/favicon.ico`;

        // Try HEAD request first
        try {
          const headResponse = await axiosInstance.head(faviconUrl, {
            validateStatus: (status) => status >= 200 && status < 400,
          });

          // If we get a 200 response, it's likely valid (even without Content-Length)
          // Many sites (Facebook, Instagram) don't return Content-Length on HEAD
          if (headResponse.status >= 200 && headResponse.status < 300) {
            const finalUrl = headResponse.request?.res?.responseUrl || faviconUrl;
            // Cache the result
            await cacheService.set(domain, finalUrl);
            metrics.found++;
            return finalUrl;
          }
        } catch (headError: any) {
          // If HEAD fails (405, 403, etc), fall back to GET with range request
          if (headError.response?.status === 405 || headError.code === 'ENOTFOUND') {
            throw headError; // Try next protocol or HTML parsing
          }
          
          // For other errors, try a small GET request
          const getResponse = await axiosInstance.get(faviconUrl, {
            responseType: 'arraybuffer',
            maxContentLength: 100 * 1024, // Only download first 100KB
            validateStatus: (status) => status >= 200 && status < 400,
          });

          // Check if we got actual data
          const dataSize = getResponse.data?.byteLength || getResponse.data?.length || 0;
          if (dataSize > 0) {
            const finalUrl = getResponse.request?.res?.responseUrl || faviconUrl;
            await cacheService.set(domain, finalUrl);
            metrics.found++;
            return finalUrl;
          }
        }
      } catch {
        // Continue to HTML parsing if /favicon.ico fails
      }

      // Strategy 2: Parse HTML for <link> tags (fallback for modern sites)
      try {
        const url = `${protocol}://${domain}`;

        const htmlResponse = await axiosInstance.get(url, {
          maxContentLength: MAX_RESPONSE_SIZE,
          responseType: 'text',
          headers: {
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });

        const $ = cheerio.load(htmlResponse.data);
        const baseUrl = htmlResponse.request?.res?.responseUrl || url;

        // Comprehensive list of favicon selectors
        const iconSelectors = [
          'link[rel="icon"]',
          'link[rel="shortcut icon"]',
          'link[rel~="icon"]', // Matches when "icon" is one of space-separated values
          'link[rel="apple-touch-icon"]',
          'link[rel="apple-touch-icon-precomposed"]',
          'meta[property="og:image"]',
        ];

        for (const selector of iconSelectors) {
          const element = $(selector).first();
          const iconHref = element.attr('href');

          if (iconHref && iconHref.trim() && !iconHref.startsWith('data:')) {
            let faviconUrl = iconHref.trim();

            try {
              // Handle different URL formats
              if (faviconUrl.startsWith('//')) {
                faviconUrl = `${protocol}:${faviconUrl}`;
              } else if (faviconUrl.startsWith('/')) {
                const base = new URL(baseUrl);
                faviconUrl = `${base.origin}${faviconUrl}`;
              } else if (!faviconUrl.startsWith('http')) {
                faviconUrl = new URL(faviconUrl, baseUrl).href;
              }

              // Cache the result
              await cacheService.set(domain, faviconUrl);
              metrics.found++;
              return faviconUrl;
            } catch {
              continue;
            }
          }
        }
      } catch {
        // HTML parsing failed, continue to next protocol
      }
    }

    // No favicon found - cache the negative result
    await cacheService.setNotFound(domain);
    metrics.notFound++;
    return null;
  } finally {
    metrics.totalDuration += Date.now() - startTime;
  }
}

/**
 * Process a batch of domains concurrently with progress callback
 */
async function processBatch(
  domains: DomainRecord[],
  onProgress?: (progress: {
    processed: number;
    total: number;
    result: FaviconResult;
  }) => void
): Promise<FaviconResult[]> {
  const results: FaviconResult[] = [];
  const total = domains.length;
  let processed = 0;

  for (let i = 0; i < domains.length; i += CONCURRENT_REQUESTS) {
    const batch = domains.slice(i, i + CONCURRENT_REQUESTS);

    const batchPromises = batch.map(async (record) => {
      try {
        const favicon = await findFavicon(record.domain);

        let result: FaviconResult;
        if (favicon) {
          result = {
            rank: record.rank,
            domain: record.domain,
            favicon_url: favicon,
            status: 'found',
          };
        } else {
          result = {
            rank: record.rank,
            domain: record.domain,
            favicon_url: '',
            status: 'not_found',
            error: 'No favicon found',
          };
        }

        processed++;
        if (onProgress) {
          onProgress({ processed, total, result });
        }

        return result;
      } catch (error) {
        metrics.errors++;
        const result: FaviconResult = {
          rank: record.rank,
          domain: record.domain,
          favicon_url: '',
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        };

        processed++;
        if (onProgress) {
          onProgress({ processed, total, result });
        }

        return result;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  return results;
}

/**
 * Test a single domain (exported for debug endpoint)
 */
export async function testSingleDomain(domain: string) {
  const startTime = Date.now();
  const faviconUrl = await findFavicon(domain);
  const duration = Date.now() - startTime;

  return {
    domain,
    favicon_url: faviconUrl || '',
    status: faviconUrl ? 'found' : 'not_found',
    duration_ms: duration,
  };
}

/**
 * Process CSV file and return results as CSV string
 */
export async function processCsvFile(
  filePath: string,
  onProgress?: (progress: {
    processed: number;
    total: number;
    result: FaviconResult;
  }) => void
): Promise<string> {
  // Read and parse CSV file
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const records = parse(fileContent, {
    skip_empty_lines: true,
    trim: true,
    from_line: 2, // Skip header row
  }) as string[][];

  // Parse domain records and filter out invalid entries
  const domains: DomainRecord[] = records
    .filter((row) => {
      // Skip if row is empty, doesn't have both columns, or domain is empty
      return row && row.length >= 2 && row[1] && row[1].trim() !== '';
    })
    .map((row) => ({
      rank: parseInt(row[0]) || 0,
      domain: row[1].trim(),
    }))
    .filter((record) => record.domain !== ''); // Extra safety check

  // Process domains
  const results = await processBatch(domains, onProgress);

  // Sort by rank
  results.sort((a, b) => a.rank - b.rank);

  // Convert to CSV
  const csvOutput = stringify(results, {
    header: true,
    columns: [
      { key: 'rank', header: 'rank' },
      { key: 'domain', header: 'domain' },
      { key: 'favicon_url', header: 'favicon_url' },
      { key: 'status', header: 'status' },
      { key: 'error', header: 'error' },
    ],
  });

  // Clean up uploaded file
  try {
    fs.unlinkSync(filePath);
  } catch {
    // Ignore cleanup errors
  }

  return csvOutput;
}
