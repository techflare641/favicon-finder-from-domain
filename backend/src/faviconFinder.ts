import axios from 'axios';
import * as cheerio from 'cheerio';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import * as fs from 'fs';

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
const CONCURRENT_REQUESTS = 50;
const REQUEST_TIMEOUT = 6000; // 6 seconds

/**
 * Find favicon for a single domain
 */
async function findFavicon(domain: string): Promise<string | null> {
  const protocols = ['https', 'http'];

  for (const protocol of protocols) {
    // Strategy 1: Parse HTML FIRST for <link> tags (modern approach)
    try {
      const url = `${protocol}://${domain}`;

      const htmlResponse = await axios.get(url, {
        timeout: REQUEST_TIMEOUT,
        maxRedirects: 5,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          Connection: 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
      });

      const $ = cheerio.load(htmlResponse.data);
      const baseUrl =
        htmlResponse.request?.res?.responseUrl || `${protocol}://${domain}`;

      // Look for various favicon link tags (comprehensive list)
      const iconSelectors = [
        'link[rel="icon"]',
        'link[rel~="icon"]', // Matches when "icon" is one of space-separated values
        'link[rel="shortcut icon"]',
        'link[rel="apple-touch-icon"]',
        'link[rel="apple-touch-icon-precomposed"]',
        'link[rel="mask-icon"]',
        'link[rel="fluid-icon"]',
        'meta[property="og:image"]',
        'meta[name="msapplication-TileImage"]',
      ];

      for (const selector of iconSelectors) {
        const elements = $(selector);

        for (let i = 0; i < elements.length; i++) {
          const element = $(elements[i]);
          const iconHref = element.attr('href') || element.attr('content');

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

              return faviconUrl;
            } catch {
              continue;
            }
          }
        }
      }
    } catch {
      // HTML fetch failed, continue to fallback
    }

    // Strategy 2: Try /favicon.ico (as fallback)
    try {
      const faviconUrl = `${protocol}://${domain}/favicon.ico`;

      const response = await axios.get(faviconUrl, {
        timeout: REQUEST_TIMEOUT,
        maxRedirects: 5,
        responseType: 'arraybuffer',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        validateStatus: (status) => status >= 200 && status < 400,
      });

      const dataSize = response.data.byteLength || response.data.length || 0;

      if (response.data && dataSize > 0) {
        const finalUrl = response.request?.res?.responseUrl || faviconUrl;
        return finalUrl;
      }
    } catch {
      // Fallback failed, continue to next protocol
    }
  }

  return null;
}

/**
 * Process a batch of domains concurrently
 */
async function processBatch(domains: DomainRecord[]): Promise<FaviconResult[]> {
  const results: FaviconResult[] = [];

  for (let i = 0; i < domains.length; i += CONCURRENT_REQUESTS) {
    const batch = domains.slice(i, i + CONCURRENT_REQUESTS);

    const batchPromises = batch.map(async (record) => {
      try {
        const favicon = await findFavicon(record.domain);

        if (favicon) {
          return {
            rank: record.rank,
            domain: record.domain,
            favicon_url: favicon,
            status: 'found',
          };
        } else {
          return {
            rank: record.rank,
            domain: record.domain,
            favicon_url: '',
            status: 'not_found',
            error: 'No favicon found',
          };
        }
      } catch (error) {
        return {
          rank: record.rank,
          domain: record.domain,
          favicon_url: '',
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
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
export async function processCsvFile(filePath: string): Promise<string> {
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
  const results = await processBatch(domains);

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
