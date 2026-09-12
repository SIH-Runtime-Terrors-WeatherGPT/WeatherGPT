import { Provider, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

export const RedisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): Redis => {
    const logger = new Logger('RedisProvider');
    const redisUrl = configService.get<string>('REDIS_URL', 'redis://localhost:6379');

    const client = new Redis(redisUrl, {
      lazyConnect: true,       // don't connect at module init — connect on first use
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
    });

    client.on('connect', () => logger.log('Redis connected'));
    client.on('error', (err) => logger.warn(`Redis connection error: ${err.message}`));

    return client;
  },
};
