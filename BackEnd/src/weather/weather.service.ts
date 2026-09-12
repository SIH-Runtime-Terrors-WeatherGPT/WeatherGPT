import {
  Injectable,
  Logger,
  NotFoundException,
  BadGatewayException,
  InternalServerErrorException,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, TimeoutError } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import { AxiosError } from 'axios';
import { throwError } from 'rxjs';
import { RedisService } from '../cache/redis.service';
import { GeminiService } from '../gemini/gemini.service';
import { OllamaService } from '../ollama/ollama.service';
import { DateResolverService } from '../common/services/date-resolver.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from '../conversations/conversations.service';
import {
  WeatherData,
  GeoResult,
  OWCurrentWeather,
  OWForecastResponse,
} from './weather.types';

const BASE_GEO_URL = 'http://api.openweathermap.org/geo/1.0';
const BASE_WEATHER_URL = 'https://api.openweathermap.org/data/2.5';
const REQUEST_TIMEOUT_MS = 8_000;

export interface WeatherQueryResult {
  answer: string;
  intent: any;
  location: {
    name: string;
    country: string;
    lat: number;
    lon: number;
  };
  weather: WeatherData;
  conversationId?: string;
}

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly apiKey: string;
  private readonly cacheTtl: number;

  constructor(
    private readonly http: HttpService,
    private readonly redis: RedisService,
    private readonly geminiService: GeminiService,
    private readonly ollamaService: OllamaService,
    private readonly dateResolverService: DateResolverService,
    private readonly prisma: PrismaService,
    private readonly conversationsService: ConversationsService,
    configService: ConfigService,
  ) {
    this.apiKey = configService.get<string>('OPENWEATHER_API_KEY', '');
    this.cacheTtl = configService.get<number>('WEATHER_CACHE_TTL', 1800);
  }

  /**
   * Main WeatherGPT end-to-end processing pipeline:
   * 1. Gemini Intent Extraction
   * 2. Date Resolution
   * 3. OpenWeather Geocoding (with Redis caching)
   * 4. OpenWeather Weather/Forecast API (with Redis caching)
   * 5. Normalization
   * 6. Ollama Natural-Language Response Generation (with Gemini fallback)
   * 7. Persistence to MongoDB
   */
  async processWeatherQuery(
    promptText: string,
    userId: string,
    conversationId?: string,
  ): Promise<WeatherQueryResult> {
    const startTime = Date.now();
    const userPrompt = promptText.trim();

    if (!userPrompt) {
      throw new BadRequestException('Prompt must not be empty.');
    }

    this.logger.log(`Processing weather query from user "${userId}": "${userPrompt}"`);

    // Step 1: Gemini Intent Extraction
    const intent = await this.geminiService.extractWeatherIntent(userPrompt);
    this.logger.log(`Extracted intent: ${JSON.stringify(intent)}`);

    // Step 2: Validate location
    if (!intent.location || intent.location.trim() === '') {
      throw new BadRequestException(
        'Could not identify location in your prompt. Please specify a city or place name (e.g. "Ahmedabad", "London", "Mumbai").',
      );
    }

    // Step 3: Date Resolution
    const resolvedTemporal = this.dateResolverService.resolveTemporal({
      date: intent.date,
    });
    const targetDate = resolvedTemporal.date || new Date().toISOString().split('T')[0];

    // Step 4: OpenWeather Geocoding (with Redis caching)
    const geo = await this.geocodeLocation(intent.location, intent.country || undefined);

    // Step 5 & 6: Fetch & Normalize Weather Data (with Redis caching)
    const weatherData = await this.getRelevantWeather(geo, targetDate);

    // Step 7: Generate Conversational Answer via Ollama (with Gemini fallback)
    let answer = await this.ollamaService.generateAnswer(userPrompt, weatherData, intent);

    if (!answer) {
      this.logger.log('Ollama answer unavailable. Generating answer via Gemini fallback...');
      answer = await this.geminiService.generatePracticalRecommendation({
        originalQuestion: userPrompt,
        structuredRequest: {
          location: intent.location,
          date: targetDate,
          activity: intent.activity || null,
          intent: intent.intent,
        },
        weather: weatherData,
      });
    }

    // Step 8: Save to MongoDB Conversations & ChatHistory
    let activeConversationId = conversationId;
    try {
      if (!activeConversationId) {
        const conv = await this.conversationsService.createConversation(userId, {
          title: `${intent.location} Weather`,
        });
        activeConversationId = conv.id;
      }

      await this.conversationsService.addMessage(
        activeConversationId,
        'user',
        userPrompt,
        intent,
      );
      await this.conversationsService.addMessage(
        activeConversationId,
        'assistant',
        answer,
        intent,
        weatherData,
      );

      await this.prisma.chatHistory.create({
        data: {
          userId,
          originalMessage: userPrompt,
          structuredRequest: intent as any,
          weatherSummary: weatherData as any,
          answer,
        },
      });
    } catch (dbErr: any) {
      this.logger.warn(`Database persistence warning: ${dbErr?.message}`);
    }

    const duration = Date.now() - startTime;
    this.logger.log(`Query processed successfully in ${duration}ms.`);

    return {
      answer,
      intent,
      location: {
        name: geo.name,
        country: geo.country,
        lat: geo.lat,
        lon: geo.lon,
      },
      weather: weatherData,
      conversationId: activeConversationId,
    };
  }

  /** Geocoding API with Redis caching (geo:<location>:<country>) */
  async geocodeLocation(location: string, country?: string): Promise<GeoResult> {
    this.guardApiKey();

    const normLoc = location.trim().toLowerCase();
    const normCountry = country ? country.trim().toLowerCase() : '';
    const cacheKey = `geo:${normLoc}:${normCountry}`;

    // Redis Cache lookup
    let cached: GeoResult | null = null;
    try {
      cached = await this.redis.get<GeoResult>(cacheKey);
    } catch (redisErr: any) {
      this.logger.warn(`Redis cache get failed for ${cacheKey}: ${redisErr?.message}`);
    }

    if (cached) {
      this.logger.log(`CACHE HIT for key: ${cacheKey}`);
      return cached;
    }

    this.logger.log(`CACHE MISS for key: ${cacheKey}`);
    this.logger.log(`OPENWEATHER REQUEST (Geocode): "${location}"`);

    const queryStr = country ? `${location},${country}` : location;
    const url = `${BASE_GEO_URL}/direct`;
    const params = { q: queryStr, limit: 1, appid: this.apiKey };

    const results = await this.fetchJson<GeoResult[]>(url, params, `geocode "${queryStr}"`);

    if (!Array.isArray(results) || results.length === 0) {
      throw new NotFoundException(
        `Location "${location}" was not found. Please verify the place name.`,
      );
    }

    const geoResult = results[0];
    // Cache geocode result for 7 days (604800s)
    this.redis.set(cacheKey, geoResult, 604800).catch((err: Error) =>
      this.logger.warn(`Failed to cache geocode for ${cacheKey}: ${err.message}`),
    );

    return geoResult;
  }

  /** Retrieves weather/forecast data with Redis caching */
  async getRelevantWeather(geo: GeoResult, targetDate: string): Promise<WeatherData> {
    this.guardApiKey();

    const cacheKey = `weather:forecast:${geo.lat}:${geo.lon}:${targetDate}`;

    let cached: WeatherData | null = null;
    try {
      cached = await this.redis.get<WeatherData>(cacheKey);
    } catch (redisErr: any) {
      this.logger.warn(`Redis cache get failed for ${cacheKey}: ${redisErr?.message}`);
    }

    if (cached) {
      this.logger.log(`CACHE HIT for key: ${cacheKey}`);
      return cached;
    }

    this.logger.log(`CACHE MISS for key: ${cacheKey}`);
    this.logger.log(`OPENWEATHER REQUEST (Weather/Forecast) for lat=${geo.lat}, lon=${geo.lon}`);

    const [current, forecast] = await Promise.all([
      this.fetchCurrentWeather(geo.lat, geo.lon),
      this.fetchForecast(geo.lat, geo.lon),
    ]);

    const data = this.normaliseForDate(geo, current, forecast, targetDate);

    this.redis.set(cacheKey, data, this.cacheTtl).catch((err: Error) =>
      this.logger.warn(`Failed to cache weather for ${cacheKey}: ${err.message}`),
    );

    return data;
  }

  async getWeather(location: string, date?: string | null): Promise<WeatherData> {
    const geo = await this.geocodeLocation(location);
    const targetDate = date ? date.trim() : new Date().toISOString().split('T')[0];
    return this.getRelevantWeather(geo, targetDate);
  }

  async getWeatherByCity(city: string): Promise<WeatherData> {
    return this.getWeather(city);
  }

  private guardApiKey(): void {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'Weather service is not configured: OPENWEATHER_API_KEY is missing',
      );
    }
  }

  private async fetchCurrentWeather(lat: number, lon: number): Promise<OWCurrentWeather> {
    const url = `${BASE_WEATHER_URL}/weather`;
    const params = { lat, lon, appid: this.apiKey, units: 'metric' };
    return this.fetchJson<OWCurrentWeather>(url, params, 'current weather');
  }

  private async fetchForecast(lat: number, lon: number): Promise<OWForecastResponse> {
    const url = `${BASE_WEATHER_URL}/forecast`;
    const params = { lat, lon, appid: this.apiKey, units: 'metric', cnt: 40 };
    return this.fetchJson<OWForecastResponse>(url, params, 'forecast');
  }

  private async fetchJson<T>(url: string, params: Record<string, unknown>, context: string): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.http.get<T>(url, { params }).pipe(
          timeout(REQUEST_TIMEOUT_MS),
          catchError((err: AxiosError | TimeoutError | Error) => {
            if (err instanceof TimeoutError) {
              return throwError(() => new BadGatewayException(`OpenWeather timed out (${context})`));
            }
            if ((err as AxiosError).isAxiosError) {
              const axiosErr = err as AxiosError;
              const status = axiosErr.response?.status;
              if (status === 401) {
                return throwError(() => new ServiceUnavailableException('Invalid OpenWeather API key'));
              }
              if (status === 404) {
                return throwError(() => new NotFoundException(`Resource not found (${context})`));
              }
              return throwError(
                () => new BadGatewayException(`OpenWeather API error ${status ?? 'unknown'} (${context})`),
              );
            }
            return throwError(() => new InternalServerErrorException(`Unexpected error (${context})`));
          }),
        ),
      );

      if (!response?.data) {
        throw new BadGatewayException(`Malformed response from OpenWeather (${context})`);
      }

      return response.data;
    } catch (err) {
      if ((err as { status?: number }).status) throw err;
      this.logger.error(`fetchJson failed for ${context}`, err);
      throw new BadGatewayException(`Failed to reach OpenWeather (${context})`);
    }
  }

  private normaliseForDate(
    geo: GeoResult,
    current: OWCurrentWeather,
    forecast: OWForecastResponse,
    targetDate: string,
  ): WeatherData {
    const dayItems = (forecast.list ?? []).filter((item) =>
      item.dt_txt?.startsWith(targetDate),
    );

    let temp: number;
    let tempHigh: number;
    let tempLow: number;
    let rainProb: number;
    let condition: string;
    let windSpeed: number;
    let humidity: number;

    if (dayItems.length > 0) {
      const temps = dayItems.map((i) => i.main.temp);
      const highTemps = dayItems.map((i) => i.main.temp_max);
      const lowTemps = dayItems.map((i) => i.main.temp_min);
      const pops = dayItems.map((i) => i.pop ?? 0);

      tempHigh = Math.max(...highTemps);
      tempLow = Math.min(...lowTemps);
      temp = temps.reduce((a, b) => a + b, 0) / temps.length;
      rainProb = Math.max(...pops);
      condition = dayItems[0].weather?.[0]?.description ?? current.weather?.[0]?.description ?? 'unknown';
      windSpeed = dayItems[0].wind?.speed ?? current.wind?.speed ?? 0;
      humidity = dayItems[0].main?.humidity ?? current.main?.humidity ?? 0;
    } else {
      temp = current.main.temp;
      tempHigh = current.main.temp_max;
      tempLow = current.main.temp_min;
      rainProb = 0;
      condition = current.weather?.[0]?.description ?? 'unknown';
      windSpeed = current.wind?.speed ?? 0;
      humidity = current.main?.humidity ?? 0;
    }

    const locationName = [
      current.name || geo.name,
      current.sys?.country || geo.country,
    ]
      .filter(Boolean)
      .join(', ');

    return {
      location: locationName,
      date: targetDate,
      temperature: Math.round(temp * 10) / 10,
      temperatureHigh: Math.round(tempHigh * 10) / 10,
      temperatureLow: Math.round(tempLow * 10) / 10,
      rainProbability: Math.round(rainProb * 100),
      condition,
      windSpeed: Math.round(windSpeed * 10) / 10,
      humidity,
    };
  }
}
