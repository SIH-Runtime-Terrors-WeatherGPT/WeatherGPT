import { Controller, Get } from '@nestjs/common';
import { RedisService } from '../cache/redis.service';

@Controller('health')
export class HealthController {
  constructor(private readonly redis: RedisService) {}

  /** GET /api/health */
  @Get()
  check(): { status: string } {
    return { status: 'ok' };
  }

  /**
   * GET /api/health/redis
   * Pings Redis and returns its reachability status.
   * Never throws — Redis being down returns { redis: 'unavailable' }.
   */
  @Get('redis')
  async checkRedis(): Promise<{ redis: string }> {
    const alive = await this.redis.ping();
    return { redis: alive ? 'ok' : 'unavailable' };
  }
}
