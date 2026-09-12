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

  // Enable CORS (support credentials with dynamic dev origins)
  const allowedOrigins = [
    frontendUrl,
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
  ];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
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
