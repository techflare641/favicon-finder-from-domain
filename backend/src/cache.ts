import { createClient, RedisClientType } from 'redis';

// Redis cache with 7-day TTL for favicon URLs
const CACHE_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

class CacheService {
  private client: RedisClientType | null = null;
  private isConnected = false;
  private useCache = true;

  async connect(): Promise<void> {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

      this.client = createClient({
        url: redisUrl,
        socket: {
          connectTimeout: 5000,
          reconnectStrategy: (retries) => {
            if (retries > 3) {
              console.warn(
                'Redis: Max reconnection attempts reached, disabling cache'
              );
              this.useCache = false;
              return false;
            }
            return Math.min(retries * 100, 3000);
          },
        },
      });

      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('✓ Redis connected successfully');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        this.isConnected = true;
      });

      await this.client.connect();
    } catch (error) {
      console.warn('Redis connection failed, running without cache:', error);
      this.useCache = false;
      this.isConnected = false;
    }
  }

  async get(domain: string): Promise<string | null> {
    if (!this.useCache || !this.isConnected || !this.client) {
      return null;
    }

    try {
      const key = `favicon:${domain}`;
      const cached = await this.client.get(key);

      if (cached) {
        console.log(`Cache HIT: ${domain}`);
        return cached;
      }

      return null;
    } catch (error) {
      console.error('Cache GET error:', error);
      return null;
    }
  }

  async set(domain: string, faviconUrl: string): Promise<void> {
    if (!this.useCache || !this.isConnected || !this.client) {
      return;
    }

    try {
      const key = `favicon:${domain}`;
      await this.client.setEx(key, CACHE_TTL, faviconUrl);
    } catch (error) {
      console.error('Cache SET error:', error);
    }
  }

  async setNotFound(domain: string): Promise<void> {
    if (!this.useCache || !this.isConnected || !this.client) {
      return;
    }

    try {
      const key = `favicon:${domain}`;
      // Cache not_found with shorter TTL (1 day)
      await this.client.setEx(key, 24 * 60 * 60, 'NOT_FOUND');
    } catch (error) {
      console.error('Cache SET error:', error);
    }
  }

  async getStats(): Promise<{ connected: boolean; useCache: boolean }> {
    return {
      connected: this.isConnected,
      useCache: this.useCache,
    };
  }

  async disconnect(): Promise<void> {
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
    }
  }
}

// Singleton instance
export const cacheService = new CacheService();
