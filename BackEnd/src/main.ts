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

  // Enable CORS
  app.enableCors({
    origin: '*', // Allow development frontend requests
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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

  await app.listen(port);
  Logger.log(`WeatherGPT Backend running on: http://localhost:${port}`);
}

bootstrap();
