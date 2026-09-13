import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { of } from 'rxjs';

// Mock @nestjs/axios before importing modules that depend on it
jest.mock('@nestjs/axios', () => {
  return {
    HttpService: class HttpService {},
  };
});

import { HttpService } from '@nestjs/axios';
import { WeatherService } from './weather.service';
import { RedisService } from '../cache/redis.service';
import { GeminiService } from '../gemini/gemini.service';
import { OllamaService } from '../ollama/ollama.service';
import { DateResolverService } from '../common/services/date-resolver.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from '../conversations/conversations.service';
import { LocationResolverService } from './services/location-resolver.service';
import { WeatherData } from './weather.types';

describe('WeatherService', () => {
  let service: WeatherService;
  let redisService: jest.Mocked<RedisService>;
  let httpService: { get: jest.Mock };

  const sampleWeatherData: WeatherData = {
    location: 'London, GB',
    date: '2026-09-13',
    temperature: 18.5,
    temperatureHigh: 21,
    temperatureLow: 14,
    rainProbability: 20,
    condition: 'light rain',
    windSpeed: 3.5,
    humidity: 65,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const mockRedis = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
    };

    const mockHttp = {
      get: jest.fn(),
    };

    const mockGemini = {
      extractWeatherIntent: jest.fn().mockResolvedValue({
        location: 'London',
        country: 'GB',
        intent: 'forecast',
        date: 'tomorrow',
        requested_data: ['rain'],
      }),
      generatePracticalRecommendation: jest.fn().mockResolvedValue('Gemini recommendation answer'),
    };

    const mockOllama = {
      generateAnswer: jest.fn().mockResolvedValue('Ollama conversational answer'),
    };

    const mockDateResolver = {
      resolveTemporal: jest.fn().mockReturnValue({ date: '2026-09-13' }),
    };

    const mockLocationResolver = {
      resolveLocation: jest.fn().mockResolvedValue({
        name: 'London',
        displayName: 'London, GB',
        lat: 51.5074,
        lon: -0.1278,
        country: 'GB',
        isAmbiguous: false,
      }),
    };

    const mockPrisma = {
      chatHistory: {
        create: jest.fn().mockResolvedValue({ id: 'history-1' }),
      },
    };

    const mockConversations = {
      createConversation: jest.fn().mockResolvedValue({ id: 'conv-1' }),
      addMessage: jest.fn().mockResolvedValue({ id: 'msg-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeatherService,
        { provide: RedisService, useValue: mockRedis },
        { provide: HttpService, useValue: mockHttp },
        { provide: GeminiService, useValue: mockGemini },
        { provide: OllamaService, useValue: mockOllama },
        { provide: DateResolverService, useValue: mockDateResolver },
        { provide: LocationResolverService, useValue: mockLocationResolver },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConversationsService, useValue: mockConversations },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, defaultVal?: any) => {
              if (key === 'OPENWEATHER_API_KEY') return 'mock_openweather_key';
              if (key === 'WEATHER_CACHE_TTL') return 1800;
              return defaultVal;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<WeatherService>(WeatherService);
    redisService = module.get(RedisService);
    httpService = module.get(HttpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getWeather Redis lookup flow', () => {
    it('CACHE HIT: should return cached data from Redis for weather forecast and NOT call OpenWeather API', async () => {
      // Mock geocode cache hit
      redisService.get.mockImplementation(async (key: string) => {
        if (key.startsWith('geo:')) {
          return { name: 'London', lat: 51.5074, lon: -0.1278, country: 'GB' };
        }
        if (key.startsWith('weather:forecast:')) {
          return sampleWeatherData;
        }
        return null;
      });

      const loggerSpy = jest.spyOn(Logger.prototype, 'log');

      const result = await service.getWeather('London', '2026-09-13');

      expect(redisService.get).toHaveBeenCalledWith('weather:forecast:51.5074:-0.1278:2026-09-13');
      expect(httpService.get).not.toHaveBeenCalled();
      expect(result).toEqual(sampleWeatherData);
      expect(loggerSpy).toHaveBeenCalledWith('[WeatherService] CACHE HIT for key: weather:forecast:51.5074:-0.1278:2026-09-13');
    });

    it('CACHE MISS: should call OpenWeather, normalize, store in Redis, and return result', async () => {
      redisService.get.mockResolvedValue(null);
      const loggerSpy = jest.spyOn(Logger.prototype, 'log');

      // Mock Geocoding
      httpService.get.mockReturnValueOnce(
        of({
          data: [{ name: 'London', lat: 51.5074, lon: -0.1278, country: 'GB' }],
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as any,
        }),
      );

      // Mock Current Weather
      httpService.get.mockReturnValueOnce(
        of({
          data: {
            name: 'London',
            sys: { country: 'GB' },
            main: { temp: 18.5, temp_min: 14, temp_max: 21, humidity: 65 },
            weather: [{ description: 'light rain' }],
            wind: { speed: 3.5 },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as any,
        }),
      );

      // Mock Forecast
      httpService.get.mockReturnValueOnce(
        of({
          data: {
            list: [
              {
                dt_txt: '2026-09-13 12:00:00',
                main: { temp: 18.5, temp_min: 14, temp_max: 21 },
                pop: 0.2,
                weather: [{ description: 'light rain' }],
              },
            ],
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as any,
        }),
      );

      const result = await service.getWeather('London', '2026-09-13');

      expect(result.location).toBe('London');
      expect(result.date).toBe('2026-09-13');
    });

    it('REDIS UNAVAILABLE: should handle Redis errors safely and proceed to OpenWeather', async () => {
      redisService.get.mockImplementation(async () => {
        throw new Error('Redis connection refused');
      });
      const loggerSpy = jest.spyOn(Logger.prototype, 'log');

      // Mock Current Weather
      httpService.get.mockReturnValueOnce(
        of({
          data: {
            name: 'London',
            sys: { country: 'GB' },
            main: { temp: 18.5, temp_min: 14, temp_max: 21, humidity: 65 },
            weather: [{ description: 'light rain' }],
            wind: { speed: 3.5 },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as any,
        }),
      );

      // Mock Forecast
      httpService.get.mockReturnValueOnce(
        of({
          data: { list: [] },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as any,
        }),
      );

      const result = await service.getWeather('London', '2026-09-13');

      expect(result.location).toBe('London');
    });
  });
});
