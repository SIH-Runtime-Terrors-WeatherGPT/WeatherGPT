import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';

// Mock @nestjs/axios prior to imports to prevent ESM transform issues in Jest
jest.mock('@nestjs/axios', () => {
  return {
    HttpService: class HttpService {},
  };
});

import { ChatService } from './chat.service';
import { GeminiService } from '../gemini/gemini.service';
import { WeatherService } from '../weather/weather.service';
import { PrismaService } from '../prisma/prisma.service';
import { WeatherData } from '../weather/weather.types';

describe('ChatService', () => {
  let service: ChatService;
  let geminiService: jest.Mocked<GeminiService>;
  let weatherService: jest.Mocked<WeatherService>;
  let prismaService: any;

  const mockWeather: WeatherData = {
    location: 'London, GB',
    date: '2026-09-13',
    temperature: 21,
    temperatureHigh: 23,
    temperatureLow: 15,
    rainProbability: 20,
    condition: 'Partly cloudy',
    windSpeed: 12,
    humidity: 60,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const mockGemini = {
      understandWeatherQuery: jest.fn(),
      generatePracticalRecommendation: jest.fn(),
    };

    const mockWeatherSvc = {
      getWeather: jest.fn(),
    };

    const mockPrisma = {
      chatHistory: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: GeminiService, useValue: mockGemini },
        { provide: WeatherService, useValue: mockWeatherSvc },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    geminiService = module.get(GeminiService);
    weatherService = module.get(WeatherService);
    prismaService = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processChatMessage', () => {
    it('should complete full WeatherGPT orchestration flow successfully', async () => {
      geminiService.understandWeatherQuery.mockResolvedValueOnce({
        location: 'London',
        date: 'tomorrow',
        resolvedDate: '2026-09-13',
        startTime: null,
        endTime: null,
        activity: 'amusement park',
        intent: 'activity_weather_recommendation',
      });

      weatherService.getWeather.mockResolvedValueOnce(mockWeather);

      const mockRecommendationText =
        'Tomorrow looks suitable for an amusement park visit in London. The temperature should be comfortable with a low chance of rain.';
      geminiService.generatePracticalRecommendation.mockResolvedValueOnce(
        mockRecommendationText,
      );

      prismaService.chatHistory.create.mockResolvedValueOnce({
        id: 'mock_chat_id_123',
        userId: 'mock_user_id',
        originalMessage: 'Will tomorrow be good for going to an amusement park in London?',
        structuredRequest: {
          location: 'London',
          date: '2026-09-13',
          activity: 'amusement park',
          intent: 'activity_weather_recommendation',
        },
        weatherSummary: {
          temperature: 21,
          temperatureHigh: 23,
          temperatureLow: 15,
          rainProbability: 20,
          condition: 'Partly cloudy',
          windSpeed: 12,
          humidity: 60,
        },
        answer: mockRecommendationText,
        createdAt: new Date(),
      });

      const response = await service.processChatMessage('mock_user_id', {
        message: 'Will tomorrow be good for going to an amusement park in London?',
      });

      expect(geminiService.understandWeatherQuery).toHaveBeenCalledWith(
        'Will tomorrow be good for going to an amusement park in London?',
      );
      expect(weatherService.getWeather).toHaveBeenCalledWith('London', '2026-09-13');
      expect(geminiService.generatePracticalRecommendation).toHaveBeenCalledWith({
        originalQuestion:
          'Will tomorrow be good for going to an amusement park in London?',
        structuredRequest: {
          location: 'London',
          date: '2026-09-13',
          activity: 'amusement park',
          intent: 'activity_weather_recommendation',
          startTime: null,
          endTime: null,
        },
        weather: mockWeather,
      });

      expect(prismaService.chatHistory.create).toHaveBeenCalledWith({
        data: {
          userId: 'mock_user_id',
          originalMessage:
            'Will tomorrow be good for going to an amusement park in London?',
          structuredRequest: {
            location: 'London',
            date: '2026-09-13',
            activity: 'amusement park',
            intent: 'activity_weather_recommendation',
            startTime: null,
            endTime: null,
          },
          weatherSummary: {
            temperature: 21,
            temperatureHigh: 23,
            temperatureLow: 15,
            rainProbability: 20,
            condition: 'Partly cloudy',
            windSpeed: 12,
            humidity: 60,
          },
          answer: mockRecommendationText,
        },
      });

      expect(response).toEqual({
        id: 'mock_chat_id_123',
        message: mockRecommendationText,
        request: {
          location: 'London',
          date: '2026-09-13',
          activity: 'amusement park',
          intent: 'activity_weather_recommendation',
        },
        weather: {
          temperature: 21,
          temperatureHigh: 23,
          temperatureLow: 15,
          rainProbability: 20,
          condition: 'Partly cloudy',
          windSpeed: 12,
          humidity: 60,
        },
      });
    });

    it('should throw BadRequestException if location cannot be extracted', async () => {
      geminiService.understandWeatherQuery.mockResolvedValueOnce({
        location: null,
        date: null,
        resolvedDate: null,
        startTime: null,
        endTime: null,
        activity: null,
        intent: 'general',
      });

      await expect(
        service.processChatMessage('mock_user_id', {
          message: 'What should I do today?',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getUserChatHistory', () => {
    it('should fetch user chat history strictly for the authenticated userId with pagination and newest first sorting', async () => {
      const mockHistoryList = [
        {
          id: 'chat_2',
          userId: 'user_123',
          originalMessage: 'Weather in London?',
          structuredRequest: { location: 'London' },
          weatherSummary: { temperature: 20 },
          answer: 'London is mild today.',
          createdAt: new Date('2026-09-12T15:00:00Z'),
        },
        {
          id: 'chat_1',
          userId: 'user_123',
          originalMessage: 'Weather in Paris?',
          structuredRequest: { location: 'Paris' },
          weatherSummary: { temperature: 22 },
          answer: 'Paris is warm today.',
          createdAt: new Date('2026-09-12T14:00:00Z'),
        },
      ];

      prismaService.chatHistory.findMany.mockResolvedValueOnce(mockHistoryList);
      prismaService.chatHistory.count.mockResolvedValueOnce(2);

      const result = await service.getUserChatHistory('user_123', { page: 1, limit: 10 });

      expect(prismaService.chatHistory.findMany).toHaveBeenCalledWith({
        where: { userId: 'user_123' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      });

      expect(result).toEqual({
        history: mockHistoryList,
        total: 2,
        page: 1,
        limit: 10,
      });
    });
  });
});
