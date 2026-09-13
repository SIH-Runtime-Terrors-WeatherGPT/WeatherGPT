import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const frontendUrl = configService.get<string>('FRONTEND_URL', 'http://localhost:5173');
  const port = configService.get<number>('PORT', 5000);

  // Validate critical environment variables on startup
  const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET'];
  for (const envVar of requiredEnvVars) {
    if (!configService.get<string>(envVar)) {
      Logger.warn(`Environment variable "${envVar}" is missing or empty!`);
    }
  }

  // Enable CORS (supports localhost, Vercel deployments, and FRONTEND_URL)
  const normalizedFrontendUrl = frontendUrl.replace(/\/+$/, '');

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      const cleanOrigin = origin.replace(/\/+$/, '');
      const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(cleanOrigin);
      const isVercel = cleanOrigin.endsWith('.vercel.app');
      const isConfiguredFrontend = Boolean(normalizedFrontendUrl && cleanOrigin === normalizedFrontendUrl);

      if (isLocalhost || isVercel || isConfiguredFrontend || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        Logger.warn(`[CORS Warning] Permitting origin: ${origin}`);
        callback(null, true);
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    credentials: true,
  });

  // Global route prefix — exclude health and weather/chat so direct POST /weather/chat and GET /health respond directly
  app.setGlobalPrefix('api', { exclude: ['health', 'weather/chat'] });

  // Global exception filter for error sanitization and HTTP status mapping
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(port, '0.0.0.0');
  Logger.log(`WeatherGPT Backend running on port ${port} (0.0.0.0)`);
}

bootstrap();
