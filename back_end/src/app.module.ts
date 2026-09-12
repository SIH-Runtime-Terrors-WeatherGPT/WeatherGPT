import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from './database/database.module';
import { CacheModule } from './cache/cache.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ChatModule } from './chat/chat.module';
import { GeminiModule } from './gemini/gemini.module';
import { WeatherModule } from './weather/weather.module';
import { OllamaModule } from './ollama/ollama.module';
import { ConversationsModule } from './conversations/conversations.module';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';

@Module({
  imports: [
    // Global config — reads .env automatically
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Infrastructure
    DatabaseModule, // MongoDB via Mongoose
    CacheModule, // Redis via ioredis (global)
    CommonModule, // Shared services (DateResolverService, etc.)

    // Feature modules
    HealthModule,
    AuthModule,
    UsersModule,
    ChatModule,
    GeminiModule,
    WeatherModule,
    OllamaModule,
    ConversationsModule,
    PrismaModule,
  ],
})
export class AppModule {}
