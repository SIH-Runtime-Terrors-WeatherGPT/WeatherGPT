import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { GeminiModule } from '../gemini/gemini.module';
import { OllamaModule } from '../ollama/ollama.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { WeatherService } from './weather.service';
import { WeatherController } from './weather.controller';

@Module({
  imports: [
    HttpModule.register({
      timeout: 8000,
    }),
    GeminiModule,
    OllamaModule,
    ConversationsModule,
  ],
  controllers: [WeatherController],
  providers: [WeatherService],
  exports: [WeatherService],
})
export class WeatherModule {}
