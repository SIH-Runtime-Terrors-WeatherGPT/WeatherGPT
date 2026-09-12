import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { GeminiService } from '../gemini/gemini.service';
import { WeatherService } from '../weather/weather.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';
import { GetHistoryQueryDto } from './dto/get-history-query.dto';

export interface ChatResponse {
  id: string;
  message: string;
  request: {
    location: string | null;
    date: string | null;
    activity: string | null;
    intent: string;
  };
  weather: {
    temperature: number;
    temperatureHigh: number;
    temperatureLow: number;
    rainProbability: number;
    condition: string;
    windSpeed: number;
    humidity: number;
  };
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly geminiService: GeminiService,
    private readonly weatherService: WeatherService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Complete WeatherGPT orchestration flow:
   * 1. JWT validation & userId extraction (handled by controller/guard)
   * 2. Message validation (via DTO)
   * 3. Gemini NLU extraction & validation
   * 4. Natural-language date resolution
   * 5. Location validation
   * 6. WeatherService lookup (Redis cache check → OpenWeather fallback)
   * 7. Gemini practical recommendation generation based on OpenWeather facts
   * 8. Save ChatHistory to MongoDB via Prisma
   * 9. Return response
   */
  async processChatMessage(
    userId: string,
    dto: CreateChatMessageDto,
  ): Promise<ChatResponse> {
    const userMessage = dto.message.trim();

    // STEP 4, 5, 6: Send message to Gemini for structured extraction & resolve date
    const nlu = await this.geminiService.understandWeatherQuery(userMessage);

    // STEP 7: Validate location
    if (!nlu.location || nlu.location.trim() === '') {
      throw new BadRequestException(
        'Location could not be determined from your message. Please specify a city or location (e.g. "London", "Mumbai", "New York").',
      );
    }

    // STEP 8, 9, 10: Request weather through WeatherService (checks Redis cache → OpenWeather fallback)
    const weatherData = await this.weatherService.getWeather(
      nlu.location,
      nlu.resolvedDate,
    );

    const targetDate = nlu.resolvedDate || nlu.date || weatherData.date;

    const structuredRequest = {
      location: nlu.location,
      date: targetDate,
      activity: nlu.activity,
      intent: nlu.intent,
      startTime: nlu.startTime,
      endTime: nlu.endTime,
    };

    // STEP 11, 12: Send actual OpenWeather facts + activity + intent to Gemini to generate recommendation
    const recommendation = await this.geminiService.generatePracticalRecommendation({
      originalQuestion: userMessage,
      structuredRequest,
      weather: weatherData,
    });

    const weatherSummary = {
      temperature: weatherData.temperature,
      temperatureHigh: weatherData.temperatureHigh,
      temperatureLow: weatherData.temperatureLow,
      rainProbability: weatherData.rainProbability,
      condition: weatherData.condition,
      windSpeed: weatherData.windSpeed,
      humidity: weatherData.humidity,
    };

    // STEP 13: Save ChatHistory to MongoDB via Prisma (userId comes exclusively from validated JWT)
    const chatRecord = await this.prisma.chatHistory.create({
      data: {
        userId,
        originalMessage: userMessage,
        structuredRequest,
        weatherSummary,
        answer: recommendation,
      },
    });

    // STEP 14: Return formatted response
    return {
      id: chatRecord.id,
      message: recommendation,
      request: {
        location: nlu.location,
        date: targetDate,
        activity: nlu.activity,
        intent: nlu.intent,
      },
      weather: weatherSummary,
    };
  }

  /**
   * Retrieves paginated chat history ONLY for the authenticated user (sorted newest first).
   * Ensures User A can NEVER access User B's chat history.
   */
  async getUserChatHistory(userId: string, query?: GetHistoryQueryDto) {
    const page = query?.page || 1;
    const limit = query?.limit || 20;
    const skip = (page - 1) * limit;

    const [history, total] = await Promise.all([
      this.prisma.chatHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.chatHistory.count({
        where: { userId },
      }),
    ]);

    return {
      history,
      total,
      page,
      limit,
    };
  }
}
