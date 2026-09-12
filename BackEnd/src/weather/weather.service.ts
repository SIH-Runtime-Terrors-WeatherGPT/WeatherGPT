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

import { LocationResolverService, ResolvedLocationResult } from './services/location-resolver.service';

export interface WeatherQueryResult {
  answer: string;
  intent: any;
  location: {
    name: string;
    displayName?: string;
    country: string;
    lat: number;
    lon: number;
  };
  weather: WeatherData;
  conversationId?: string;
  isAmbiguous?: boolean;
  candidates?: any[];
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
    private readonly locationResolverService: LocationResolverService,
    private readonly prisma: PrismaService,
    private readonly conversationsService: ConversationsService,
    configService: ConfigService,
  ) {
    this.apiKey = configService.get<string>('OPENWEATHER_API_KEY', '');
    this.cacheTtl = configService.get<number>('WEATHER_CACHE_TTL', 1800);
  }

  /**
   * Main WeatherGPT end-to-end processing pipeline:
   * 1. Gemini Intent & Entity Extraction
   * 2. Location Resolution (POIs, Landmarks, Cities -> Coordinates)
   * 3. Date Resolution
   * 4. OpenWeather Weather & Forecast API (Strictly by Lat, Lon)
   * 5. Ollama Response Generation (with Gemini fallback)
   * 6. Persistence to MongoDB
   */
  async processWeatherQuery(
    promptText: string,
    userId: string,
    conversationId?: string,
    mapLocation?: { name?: string; lat?: number; lon?: number },
  ): Promise<WeatherQueryResult> {
    const startTime = Date.now();
    const userPrompt = promptText.trim();

    if (!userPrompt) {
      throw new BadRequestException('Prompt must not be empty.');
    }

    this.logger.log(`[Pipeline Start] User "${userId}" prompt: "${userPrompt}"`);

    // Step 1: Gemini Intent & Entity Extraction
    const intent = await this.geminiService.extractWeatherIntent(userPrompt);
    this.logger.log(`[Pipeline Step 1] Gemini Extracted Intent: ${JSON.stringify(intent)}`);

    // Step 1b: Map Location Fallback if prompt does NOT specify a location in text or uses generic relative terms
    const isGenericLocation = (locStr: string | null | undefined): boolean => {
      if (!locStr) return true;
      const lower = locStr.toLowerCase().trim();
      const genericWords = [
        'give', 'show', 'tell', 'here', 'this area', 'this location', 'my location',
        'current location', 'near here', 'selected location', 'pointer location',
        'the location', 'this place', 'area'
      ];
      return genericWords.includes(lower);
    };

    const isMapFallbackUsed =
      (!intent.target_place || isGenericLocation(intent.target_place)) &&
      (!intent.location || intent.location.trim() === '' || isGenericLocation(intent.location)) &&
      mapLocation &&
      (mapLocation.name || mapLocation.lat !== undefined);

    if (isMapFallbackUsed) {
      intent.target_place = mapLocation!.name || 'Selected Map Location';
      intent.location = mapLocation!.name || 'Selected Map Location';
      this.logger.log(
        `[Pipeline Step 1b] Map location fallback applied: target_place="${intent.target_place}" (${mapLocation!.lat}, ${mapLocation!.lon})`,
      );
    }

    // Step 2: Location Resolver Layer (Real-world Place / POI / Landmark / City -> Coordinates)
    let resolvedLoc: ResolvedLocationResult;
    if (
      isMapFallbackUsed &&
      mapLocation &&
      mapLocation.lat !== undefined &&
      mapLocation.lon !== undefined
    ) {
      resolvedLoc = {
        name: mapLocation.name || 'Selected Map Location',
        displayName: mapLocation.name || 'Selected Map Location',
        lat: mapLocation.lat,
        lon: mapLocation.lon,
        country: 'GLOBAL',
        isAmbiguous: false,
      };
    } else {
      resolvedLoc = await this.locationResolverService.resolveLocation(intent);
    }
    this.logger.log(
      `[Pipeline Step 2] Location Resolved: "${resolvedLoc.name}" (${resolvedLoc.displayName}) -> lat: ${resolvedLoc.lat}, lon: ${resolvedLoc.lon}`,
    );

    // Ambiguity Handling: Return candidates if query matched multiple distinct locations
    if (resolvedLoc.isAmbiguous && resolvedLoc.candidates && resolvedLoc.candidates.length > 1) {
      const candidateListStr = resolvedLoc.candidates
        .map((c) => `• ${c.displayName}`)
        .join('\n');
      const ambiguityAnswer = `I found multiple locations matching "${intent.target_place || intent.location}". Please specify which location you mean:\n${candidateListStr}`;

      this.logger.log(`[Pipeline Step 2 - Ambiguity] Query matched ${resolvedLoc.candidates.length} candidate places.`);

      return {
        answer: ambiguityAnswer,
        intent,
        location: {
          name: resolvedLoc.name,
          displayName: resolvedLoc.displayName,
          country: resolvedLoc.country,
          lat: resolvedLoc.lat,
          lon: resolvedLoc.lon,
        },
        weather: {
          location: resolvedLoc.name,
          date: new Date().toISOString().split('T')[0],
          temperature: 0,
          temperatureHigh: 0,
          temperatureLow: 0,
          rainProbability: 0,
          condition: 'Ambiguous Location',
          windSpeed: 0,
          humidity: 0,
        },
        isAmbiguous: true,
        candidates: resolvedLoc.candidates,
        conversationId,
      };
    }

    // Step 3: Date Resolution (Supports specific dates and date ranges)
    const todayDate = this.dateResolverService.resolveTemporal({ date: 'today' }).date || new Date().toISOString().split('T')[0];

    let targetDate: string;
    if (intent.startDate) {
      targetDate = intent.startDate;
    } else {
      const resolvedTemporal = this.dateResolverService.resolveTemporal({ date: intent.date });
      targetDate = resolvedTemporal.date || todayDate;
    }

    if (intent.isDateRange && intent.startDate && intent.endDate) {
      intent.date = `${intent.startDate} to ${intent.endDate}`;
    } else {
      intent.date = targetDate;
    }

    // Step 4: Fetch Weather Data strictly using resolved coordinates (lat, lon)
    const weatherData = await this.getRelevantWeatherByCoords(resolvedLoc, targetDate);
    if (intent.isDateRange && intent.endDate) {
      weatherData.date = intent.date;
    }
    this.logger.log(
      `[Pipeline Step 3] OpenWeather Fetched for (${resolvedLoc.lat}, ${resolvedLoc.lon}): Temp=${weatherData.temperature}°C, High=${weatherData.temperatureHigh}°C, Low=${weatherData.temperatureLow}°C, Condition="${weatherData.condition}"`,
    );

    // Step 5: Answer Generation via Ollama (with Gemini fallback)
    let answer = await this.ollamaService.generateAnswer(userPrompt, weatherData, intent);

    if (!answer) {
      this.logger.log('[Pipeline Step 4] Ollama unavailable. Generating answer via Gemini fallback...');
      answer = await this.geminiService.generatePracticalRecommendation({
        originalQuestion: userPrompt,
        structuredRequest: {
          location: resolvedLoc.name,
          date: intent.date,
          activity: intent.activity || null,
          intent: intent.intent,
        },
        weather: weatherData,
      });
    }

    this.logger.log(`[Pipeline Step 4] Response Generated: "${answer.substring(0, 90)}..."`);

    // Step 6: Save to MongoDB Conversations & ChatHistory
    let activeConversationId = conversationId;
    try {
      if (!activeConversationId) {
        const conv = await this.conversationsService.createConversation(userId, {
          title: `${resolvedLoc.name} Weather`,
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
    this.logger.log(`[Pipeline Finish] Query processed successfully in ${duration}ms.`);

    return {
      answer,
      intent,
      location: {
        name: resolvedLoc.name,
        displayName: resolvedLoc.displayName,
        country: resolvedLoc.country,
        lat: resolvedLoc.lat,
        lon: resolvedLoc.lon,
      },
      weather: weatherData,
      conversationId: activeConversationId,
    };
  }

  /** Retrieves weather/forecast data using resolved coordinates and Redis caching */
  async getRelevantWeatherByCoords(
    resolvedLoc: ResolvedLocationResult,
    targetDate: string,
  ): Promise<WeatherData> {
    this.guardApiKey();

    const cacheKey = `weather:forecast:${resolvedLoc.lat}:${resolvedLoc.lon}:${targetDate}`;

    let cached: WeatherData | null = null;
    try {
      cached = await this.redis.get<WeatherData>(cacheKey);
    } catch (redisErr: any) {
      this.logger.warn(`Redis cache get failed for ${cacheKey}: ${redisErr?.message}`);
    }

    if (cached) {
      this.logger.log(`[WeatherService] CACHE HIT for key: ${cacheKey}`);
      return cached;
    }

    this.logger.log(`[WeatherService] OPENWEATHER REQUEST for lat=${resolvedLoc.lat}, lon=${resolvedLoc.lon}`);

    const [current, forecast] = await Promise.all([
      this.fetchCurrentWeather(resolvedLoc.lat, resolvedLoc.lon),
      this.fetchForecast(resolvedLoc.lat, resolvedLoc.lon),
    ]);

    const data = this.normaliseForDateByCoords(resolvedLoc, current, forecast, targetDate);

    this.redis.set(cacheKey, data, this.cacheTtl).catch((err: Error) =>
      this.logger.warn(`Failed to cache weather for ${cacheKey}: ${err.message}`),
    );

    return data;
  }

  /** Geocoding API with Redis caching (geo:<location>:<country>) - Deprecated fallback */
  async geocodeLocation(location: string, country?: string): Promise<GeoResult> {
    const resolved = await this.locationResolverService.resolveLocation({
      target_place: location,
      location,
      country,
      intent: 'current',
      requested_data: ['temperature'],
    });

    return {
      name: resolved.name,
      lat: resolved.lat,
      lon: resolved.lon,
      country: resolved.country,
    };
  }

  /** Retrieves weather/forecast data with Redis caching */
  async getRelevantWeather(geo: GeoResult, targetDate: string): Promise<WeatherData> {
    return this.getRelevantWeatherByCoords(
      {
        name: geo.name,
        displayName: `${geo.name}, ${geo.country}`,
        lat: geo.lat,
        lon: geo.lon,
        country: geo.country,
        isAmbiguous: false,
      },
      targetDate,
    );
  }

  async getWeather(location: string, date?: string | null): Promise<WeatherData> {
    const resolved = await this.locationResolverService.resolveLocation({
      target_place: location,
      location,
      intent: 'current',
      requested_data: ['temperature'],
    });
    const todayDate = this.dateResolverService.resolveTemporal({ date: 'today' }).date || new Date().toISOString().split('T')[0];
    const targetDate = date ? date.trim() : todayDate;
    return this.getRelevantWeatherByCoords(resolved, targetDate);
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

  private normaliseForDateByCoords(
    resolvedLoc: ResolvedLocationResult,
    current: OWCurrentWeather,
    forecast: OWForecastResponse,
    targetDate: string,
  ): WeatherData {
    let dayItems = (forecast.list ?? []).filter((item) =>
      item.dt_txt?.startsWith(targetDate),
    );

    let effectiveDate = targetDate;
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
    } else if (forecast.list && forecast.list.length > 0) {
      const availableDates = Array.from(new Set(forecast.list.map((i) => i.dt_txt?.split(' ')[0]))).filter(Boolean) as string[];
      let closestDate = availableDates[0];
      if (targetDate < availableDates[0]) {
        closestDate = availableDates[0];
      } else if (targetDate > availableDates[availableDates.length - 1]) {
        closestDate = availableDates[availableDates.length - 1];
      } else {
        closestDate = availableDates.find((d) => d >= targetDate) || availableDates[0];
      }
      effectiveDate = closestDate;
      dayItems = forecast.list.filter((item) => item.dt_txt?.startsWith(effectiveDate));
      const targetItems = dayItems.length > 0 ? dayItems : forecast.list;

      const temps = targetItems.map((i) => i.main.temp);
      const highTemps = targetItems.map((i) => i.main.temp_max);
      const lowTemps = targetItems.map((i) => i.main.temp_min);
      const pops = targetItems.map((i) => i.pop ?? 0);

      tempHigh = Math.max(...highTemps);
      tempLow = Math.min(...lowTemps);
      temp = temps.reduce((a, b) => a + b, 0) / temps.length;
      rainProb = Math.max(...pops);
      condition = targetItems[0].weather?.[0]?.description ?? current.weather?.[0]?.description ?? 'unknown';
      windSpeed = targetItems[0].wind?.speed ?? current.wind?.speed ?? 0;
      humidity = targetItems[0].main?.humidity ?? current.main?.humidity ?? 0;
    } else {
      temp = current.main.temp;
      tempHigh = current.main.temp_max;
      tempLow = current.main.temp_min;
      rainProb = 0;
      condition = current.weather?.[0]?.description ?? 'unknown';
      windSpeed = current.wind?.speed ?? 0;
      humidity = current.main?.humidity ?? 0;
    }

    return {
      location: resolvedLoc.name,
      date: effectiveDate,
      requestedDate: targetDate,
      isForecastLimitReached: targetDate !== effectiveDate,
      temperature: Math.round(temp * 10) / 10,
      temperatureHigh: Math.round(tempHigh * 10) / 10,
      temperatureLow: Math.round(tempLow * 10) / 10,
      rainProbability: Math.round(rainProb * 100),
      condition,
      windSpeed: Math.round(windSpeed * 10) / 10,
      humidity,
    };
  }

  private normaliseForDate(
    geo: GeoResult,
    current: OWCurrentWeather,
    forecast: OWForecastResponse,
    targetDate: string,
  ): WeatherData {
    return this.normaliseForDateByCoords(
      {
        name: geo.name,
        displayName: `${geo.name}, ${geo.country}`,
        lat: geo.lat,
        lon: geo.lon,
        country: geo.country,
        isAmbiguous: false,
      },
      current,
      forecast,
      targetDate,
    );
  }
}
