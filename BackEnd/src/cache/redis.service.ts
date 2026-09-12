import { Injectable, Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.provider';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  /** Default TTL (seconds) read from WEATHER_CACHE_TTL env var. */
  readonly weatherCacheTtl: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis,
    configService: ConfigService,
  ) {
    this.weatherCacheTtl = configService.get<number>('WEATHER_CACHE_TTL', 1800);
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────────

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => {
      // ignore errors on shutdown
    });
  }

  // ─── Core operations ─────────────────────────────────────────────────────────

  /**
   * Retrieve a cached value by key.
   * Returns the parsed JSON value, or null on cache miss or Redis error.
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger.warn(`Redis GET failed for key "${key}": ${(error as Error).message}`);
      return null; // graceful degradation — treat as cache miss
    }
  }

  /**
   * Store a value in Redis as serialised JSON.
   *
   * @param key   Cache key
   * @param value Any JSON-serialisable value
   * @param ttl   Expiry in seconds (defaults to WEATHER_CACHE_TTL)
   */
  async set(key: string, value: unknown, ttl: number = this.weatherCacheTtl): Promise<void> {
    try {
      const serialised = JSON.stringify(value);
      await this.client.set(key, serialised, 'EX', ttl);
    } catch (error) {
      // A Redis write failure must not crash the calling service
      this.logger.warn(`Redis SET failed for key "${key}": ${(error as Error).message}`);
    }
  }

  /**
   * Delete a key from Redis.
   * Returns true if the key was deleted, false if it didn't exist or on error.
   */
  async delete(key: string): Promise<boolean> {
    try {
      const deleted = await this.client.del(key);
      return deleted > 0;
    } catch (error) {
      this.logger.warn(`Redis DEL failed for key "${key}": ${(error as Error).message}`);
      return false;
    }
  }

  // ─── Utility ─────────────────────────────────────────────────────────────────

  /**
   * Check if Redis is reachable.
   * Safe to call at any time — returns false instead of throwing.
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}
