import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisProvider, REDIS_CLIENT } from './redis.provider';
import { RedisService } from './redis.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    RedisProvider,  // raw ioredis client bound to REDIS_CLIENT token
    RedisService,   // high-level service with get/set/delete + JSON + safe errors
  ],
  exports: [
    REDIS_CLIENT,   // available if a module ever needs the raw client directly
    RedisService,   // primary export — inject this in feature services
  ],
})
export class CacheModule {}
