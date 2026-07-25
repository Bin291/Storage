import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Cache metadata thường dùng (mục 5.C PLAN.md).
 * Chiến lược invalidation: (1) chủ động xoá key khi ghi; (2) TTL ngắn làm lưới an toàn.
 */
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private client!: Redis;
  private readonly defaultTtl = 60; // giây — lưới an toàn (mục 5.C)

  constructor(private readonly config: ConfigService) {}

  private lastErrorLog = 0;

  onModuleInit(): void {
    this.client = new Redis({
      host: this.config.get<string>('redis.host'),
      port: this.config.get<number>('redis.port'),
      password: this.config.get<string>('redis.password'),
      ...(this.config.get<boolean>('redis.tls') ? { tls: {} } : {}),
      maxRetriesPerRequest: null,
      lazyConnect: false,
      // Giãn thời gian thử lại để không spam log khi Redis chưa chạy.
      retryStrategy: (times: number) => Math.min(times * 1000, 15_000),
    });
    // Chỉ log lỗi Redis tối đa 1 lần / 15s để tránh ngập terminal.
    this.client.on('error', (err) => {
      const now = Date.now();
      if (now - this.lastErrorLog > 15_000) {
        this.lastErrorLog = now;
        this.logger.warn(
          `Redis chưa kết nối được (${err.message}). Chạy: docker compose up -d`,
        );
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit();
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async set(key: string, value: unknown, ttl = this.defaultTtl): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttl);
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length) await this.client.del(...keys);
  }

  /** Xoá theo pattern (VD 'files:user123:*') khi có thao tác ghi. */
  async delByPattern(pattern: string): Promise<void> {
    const stream = this.client.scanStream({ match: pattern, count: 100 });
    const pipeline = this.client.pipeline();
    let found = 0;
    for await (const keys of stream) {
      for (const key of keys as string[]) {
        pipeline.del(key);
        found++;
      }
    }
    if (found) await pipeline.exec();
  }

  /** Lấy từ cache hoặc tính rồi cache lại. */
  async wrap<T>(key: string, ttl: number, factory: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }
}
