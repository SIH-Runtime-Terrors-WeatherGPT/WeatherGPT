import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  BadGatewayException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { WeatherData } from '../weather/weather.types';
import { ExtractedNluQueryDto } from './dto/extracted-nlu-query.dto';
import { DateResolverService } from '../common/services/date-resolver.service';

export interface WeatherIntentSchema {
  location: string | null;
  country?: string | null;
  intent: 'current' | 'forecast' | 'alerts';
  date?: string | null;
  time_period?: 'morning' | 'afternoon' | 'evening' | 'night' | null;
  requested_data: string[];
  activity?: string | null;
}

export interface ParsedWeatherQuery {
  city: string | null;
  intent: 'current_weather' | 'forecast' | 'recommendation' | 'general';
  isWeatherRelated: boolean;
  originalQuery: string;
}

export interface ExtractedNluQuery {
  location: string | null;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  activity: string | null;
  intent: string;
}

export interface ResolvedNluQuery extends ExtractedNluQuery {
  resolvedDate: string | null;
}

export interface StructuredRecommendationRequest {
  location: string | null;
  date: string | null;
  activity: string | null;
  intent: string;
  startTime?: string | null;
  endTime?: string | null;
}

export interface GeneratePracticalRecommendationInput {
  originalQuestion: string;
  structuredRequest: StructuredRecommendationRequest;
  weather: WeatherData;
}

export interface WeatherRecommendationOptions {
  userMessage?: string;
}

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly defaultModelName = 'gemini-1.5-flash';
  private readonly timeoutMs = 10000; // 10 seconds

  constructor(
    private readonly configService: ConfigService,
    private readonly dateResolverService: DateResolverService,
  ) {}

  private getAIClient(): GoogleGenerativeAI {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey || apiKey.trim() === '') {
      this.logger.error('GEMINI_API_KEY is not set in environment variables');
      throw new ServiceUnavailableException(
        'Gemini API service is not configured. GEMINI_API_KEY is missing.',
      );
    }
    return new GoogleGenerativeAI(apiKey);
  }

  private async executeWithTimeout<T>(
    operationName: string,
    action: (ai: GoogleGenerativeAI) => Promise<T>,
  ): Promise<T> {
    const ai = this.getAIClient();

    let timeoutId: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new GatewayTimeoutException(
            `${operationName} timed out after ${this.timeoutMs}ms`,
          ),
        );
      }, this.timeoutMs);
    });

    try {
      const result = await Promise.race([action(ai), timeoutPromise]);
      return result;
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }

      const errorMessage = error?.message || String(error);
      this.logger.error(`Gemini API error during [${operationName}]: ${errorMessage}`);

      if (
        errorMessage.includes('429') ||
        errorMessage.includes('RESOURCE_EXHAUSTED') ||
        errorMessage.toLowerCase().includes('rate limit')
      ) {
        throw new HttpException(
          'Gemini API rate limit exceeded. Please try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      throw new BadGatewayException(
        `Gemini API call failed during ${operationName}: ${errorMessage}`,
      );
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private cleanJsonResponse(rawText: string): string {
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/i, '').replace(/\s*```$/i, '');
    }
    return cleaned.trim();
  }

  /**
   * Fallback rule-based NLU intent extraction if Gemini API is unreachable or rate-limited.
   */
  private fallbackExtractWeatherIntent(promptText: string): WeatherIntentSchema {
    const text = promptText.trim();
    const lower = text.toLowerCase();

    // 1. Extract location
    let location: string | null = null;
    let country: string | null = null;

    const indianCities = [
      'ahmedabad',
      'mumbai',
      'delhi',
      'surat',
      'rajkot',
      'bengaluru',
      'bangalore',
      'chennai',
      'kolkata',
      'hyderabad',
      'pune',
    ];
    for (const city of indianCities) {
      if (lower.includes(city)) {
        location = city.charAt(0).toUpperCase() + city.slice(1);
        country = 'IN';
        break;
      }
    }

    if (!location) {
      const otherCities = ['london', 'paris', 'new york', 'tokyo', 'sydney'];
      for (const city of otherCities) {
        if (lower.includes(city)) {
          location = city.charAt(0).toUpperCase() + city.slice(1);
          break;
        }
      }
    }

    if (!location) {
      const match = text.match(/\b(?:in|at|for)\s+([A-Z][a-z]+)\b/);
      if (match) location = match[1];
    }

    // 2. Extract date
    let date = 'today';
    if (lower.includes('tomorrow')) date = 'tomorrow';
    else if (lower.includes('tonight')) date = 'tonight';
    else if (lower.includes('this weekend')) date = 'this weekend';

    // 3. Extract time period
    let timePeriod: 'morning' | 'afternoon' | 'evening' | 'night' | null = null;
    if (lower.includes('morning')) timePeriod = 'morning';
    else if (lower.includes('afternoon')) timePeriod = 'afternoon';
    else if (lower.includes('evening')) timePeriod = 'evening';
    else if (lower.includes('night')) timePeriod = 'night';

    // 4. Extract activity
    let activity: string | null = null;
    if (lower.includes('cricket')) activity = 'cricket match';
    else if (lower.includes('amusement park')) activity = 'amusement park';
    else if (lower.includes('umbrella')) activity = 'carrying umbrella';

    // 5. Requested data
    const requestedData: string[] = [];
    if (lower.includes('rain') || lower.includes('umbrella') || lower.includes('precipitation')) {
      requestedData.push('rain', 'precipitation_probability');
    }
    if (lower.includes('hot') || lower.includes('temp') || lower.includes('cold') || lower.includes('weather')) {
      requestedData.push('temperature', 'weather_condition');
    }
    if (lower.includes('wind') || lower.includes('windy')) {
      requestedData.push('wind_speed', 'wind_direction');
    }
    if (requestedData.length === 0) {
      requestedData.push('temperature', 'weather_condition');
    }

    return {
      location,
      country,
      intent: lower.includes('tomorrow') || lower.includes('forecast') ? 'forecast' : 'current',
      date,
      time_period: timePeriod,
      activity,
      requested_data: Array.from(new Set(requestedData)),
    };
  }

  /**
   * Section 8, 9, 10: Gemini Weather Intent Extraction
   * Extracts structured weather intent JSON matching WeatherGPT schema without generating answer.
   */
  async extractWeatherIntent(promptText: string): Promise<WeatherIntentSchema> {
    this.getAIClient(); // Ensures ServiceUnavailableException is thrown if GEMINI_API_KEY is missing

    if (!promptText || promptText.trim() === '') {
      return {
        location: null,
        country: null,
        intent: 'current',
        date: 'today',
        time_period: null,
        requested_data: ['temperature'],
      };
    }

    const systemInstruction = `You are the WeatherGPT intent extraction engine.
Your job is to understand a user's natural-language weather question and extract the structured information required to retrieve weather data.
Do NOT answer the user's question.

Extract:
- location (city/place name or null if not mentioned)
- country (ISO 2-letter country code or country name if mentioned, else null)
- intent ("current" | "forecast" | "alerts")
- date (natural expression e.g. "today", "tomorrow", "this weekend", "next Monday", or null)
- time_period ("morning" | "afternoon" | "evening" | "night" | null)
- activity (e.g. "amusement park", "cricket match", "biking", "running", or null if no specific activity)
- requested_data (array of relevant parameters: "temperature", "feels_like", "humidity", "rain", "precipitation_probability", "wind_speed", "wind_direction", "pressure", "visibility", "weather_condition", "sunrise", "sunset", "uv_index")

Do NOT invent a location. Return valid JSON only.`;

    const candidateModels = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-1.5-flash-latest'];

    for (const modelName of candidateModels) {
      try {
        const rawResponse = await this.executeWithTimeout('extractWeatherIntent', async (ai) => {
          const model = ai.getGenerativeModel({
            model: modelName,
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          });

          const result = await model.generateContent([
            systemInstruction,
            `User prompt: "${promptText}"`,
          ]);

          return result.response.text();
        });

        const cleaned = this.cleanJsonResponse(rawResponse);
        const parsed = JSON.parse(cleaned);

        const locStr = typeof parsed.location === 'string' ? parsed.location.trim() : null;
        let countryStr = typeof parsed.country === 'string' ? parsed.country.trim() : null;

        if (locStr && !countryStr) {
          const indianCities = [
            'ahmedabad',
            'mumbai',
            'delhi',
            'surat',
            'rajkot',
            'bengaluru',
            'bangalore',
            'chennai',
            'kolkata',
            'hyderabad',
            'pune',
          ];
          if (indianCities.includes(locStr.toLowerCase())) {
            countryStr = 'IN';
          }
        }

        return {
          location: locStr,
          country: countryStr,
          intent: ['current', 'forecast', 'alerts'].includes(parsed.intent)
            ? parsed.intent
            : 'forecast',
          date: typeof parsed.date === 'string' ? parsed.date.trim() : 'today',
          time_period: ['morning', 'afternoon', 'evening', 'night'].includes(parsed.time_period)
            ? parsed.time_period
            : null,
          activity: typeof parsed.activity === 'string' ? parsed.activity.trim() : null,
          requested_data:
            Array.isArray(parsed.requested_data) && parsed.requested_data.length > 0
              ? parsed.requested_data
              : ['temperature', 'weather_condition'],
        };
      } catch (err: any) {
        this.logger.warn(`Gemini model "${modelName}" failed: ${err?.message}`);
      }
    }

    this.logger.log(`Using rule-based NLU fallback for prompt: "${promptText}"`);
    return this.fallbackExtractWeatherIntent(promptText);
  }

  /**
   * Understands natural-language weather questions and extracts structured NLU data.
   */
  async understandWeatherQuery(
    userMessage: string,
    referenceDate: Date = new Date(),
    timezone?: string,
  ): Promise<ResolvedNluQuery> {
    const extractedIntent = await this.extractWeatherIntent(userMessage);

    const resolvedTemporal = this.dateResolverService.resolveTemporal(
      {
        date: extractedIntent.date,
        timezone,
      },
      referenceDate,
    );

    return {
      location: extractedIntent.location,
      date: extractedIntent.date || null,
      resolvedDate: resolvedTemporal.date,
      startTime: resolvedTemporal.startTime,
      endTime: resolvedTemporal.endTime,
      activity: extractedIntent.activity || null,
      intent: extractedIntent.intent,
    };
  }

  async parseWeatherQuery(userMessage: string): Promise<ParsedWeatherQuery> {
    const nlu = await this.understandWeatherQuery(userMessage);

    let mappedIntent: 'current_weather' | 'forecast' | 'recommendation' | 'general' = 'general';
    if (nlu.intent === 'alerts' || nlu.activity) {
      mappedIntent = 'recommendation';
    } else if (nlu.intent === 'forecast') {
      mappedIntent = 'forecast';
    } else if (nlu.location) {
      mappedIntent = 'current_weather';
    }

    return {
      city: nlu.location,
      intent: mappedIntent,
      isWeatherRelated: nlu.location !== null || nlu.activity !== null,
      originalQuery: userMessage,
    };
  }

  async generatePracticalRecommendation(
    input: GeneratePracticalRecommendationInput,
  ): Promise<string> {
    this.getAIClient(); // Ensures ServiceUnavailableException is thrown if GEMINI_API_KEY is missing

    const { originalQuestion, structuredRequest, weather } = input;

    if (!weather) {
      throw new InternalServerErrorException(
        'Weather data must be provided to generate a practical recommendation.',
      );
    }

    const systemInstruction = `You are WeatherGPT, a practical weather recommendation assistant.
Generate a concise, helpful recommendation for the user based STRICTLY on the actual weather facts provided by OpenWeather.

CRITICAL CONSTRAINTS:
1. Do NOT invent, assume, or modify any weather facts (temperature, rain chance, wind speed, condition, humidity).
2. Base all weather statements ONLY on the provided OpenWeather facts. OpenWeather is the single source of weather truth.
3. Explicitly address the user's requested activity (e.g. "${structuredRequest?.activity || 'general plans'}") and whether conditions are suitable.
4. Keep the recommendation concise, natural, direct, and practical (2 to 3 sentences max).
5. Suggest relevant clothing, gear, or precautions (e.g. light jacket, umbrella, sunscreen) appropriate for the given conditions.`;

    const prompt = `User Question: "${originalQuestion}"

Structured Request Context:
- Target Location: ${structuredRequest?.location || weather.location}
- Target Date: ${structuredRequest?.date || weather.date}
- Target Activity: ${structuredRequest?.activity || 'General plans'}
- User Intent: ${structuredRequest?.intent || 'activity_weather_recommendation'}

Actual OpenWeather Facts:
- Location: ${weather.location}
- Date: ${weather.date}
- Current Temp: ${weather.temperature}°C
- High Temp: ${weather.temperatureHigh}°C
- Low Temp: ${weather.temperatureLow}°C
- Rain Probability: ${weather.rainProbability}%
- Sky Condition: ${weather.condition}
- Wind Speed: ${weather.windSpeed} m/s
- Humidity: ${weather.humidity}%

Generate a practical recommendation now.`;

    const candidateModels = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-1.5-flash-latest'];
    let lastError: any = null;
    let emptyResponseReturned = false;

    for (const modelName of candidateModels) {
      try {
        const text = await this.executeWithTimeout('generatePracticalRecommendation', async (ai) => {
          const model = ai.getGenerativeModel({
            model: modelName,
            generationConfig: {
              temperature: 0.3,
            },
          });

          const result = await model.generateContent([systemInstruction, prompt]);
          return result.response.text();
        });

        if (text !== undefined && text.trim() === '') {
          emptyResponseReturned = true;
          break;
        }

        if (text && text.trim() !== '') {
          return text.trim();
        }
      } catch (err: any) {
        lastError = err;
        this.logger.warn(`Gemini recommendation model "${modelName}" failed: ${err?.message}`);
      }
    }

    if (emptyResponseReturned) {
      throw new InternalServerErrorException(
        'Gemini returned an empty recommendation response.',
      );
    }

    // Grounded fallback response strictly based on supplied OpenWeather facts
    const rainMsg =
      (weather.rainProbability ?? 0) >= 40
        ? `There is a ${weather.rainProbability}% chance of precipitation in ${weather.location} for ${weather.date} (${weather.condition}). Carrying an umbrella is advisable.`
        : `In ${weather.location} for ${weather.date}, expect ${weather.condition} with a temperature around ${weather.temperature}°C (High: ${weather.temperatureHigh}°C, Low: ${weather.temperatureLow}°C). Precipitation chance is ${weather.rainProbability}%.`;

    const windMsg = weather.windSpeed ? ` Wind speed is expected around ${weather.windSpeed} m/s.` : '';

    return `${rainMsg}${windMsg}`;
  }

  async generateWeatherRecommendation(
    weatherData: WeatherData,
    options?: WeatherRecommendationOptions,
  ): Promise<string> {
    return this.generatePracticalRecommendation({
      originalQuestion: options?.userMessage || 'What should I wear or plan for today?',
      structuredRequest: {
        location: weatherData.location,
        date: weatherData.date,
        activity: null,
        intent: 'weather_recommendation',
      },
      weather: weatherData,
    });
  }
}
