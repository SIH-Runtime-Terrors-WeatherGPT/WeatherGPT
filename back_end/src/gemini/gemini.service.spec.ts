import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  ServiceUnavailableException,
  InternalServerErrorException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { WeatherData } from '../weather/weather.types';

const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn().mockImplementation(() => ({
  generateContent: mockGenerateContent,
}));

jest.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: mockGetGenerativeModel,
    })),
    SchemaType: {
      OBJECT: 'OBJECT',
      STRING: 'STRING',
    },
  };
});

describe('GeminiService', () => {
  let service: GeminiService;
  let configService: ConfigService;
  const refDate = new Date(2026, 8, 12); // Saturday, Sep 12, 2026

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'GEMINI_API_KEY') return 'mock_gemini_api_key';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<GeminiService>(GeminiService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Missing API Key handling', () => {
    it('should throw ServiceUnavailableException if GEMINI_API_KEY is missing', async () => {
      jest.spyOn(configService, 'get').mockReturnValue('');

      await expect(
        service.understandWeatherQuery('Will tomorrow be good for going to an amusement park in London?'),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('understandWeatherQuery (NLU)', () => {
    it('should extract structured NLU data and resolve natural-language date', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              location: 'London',
              date: 'tomorrow',
              startTime: null,
              endTime: null,
              activity: 'amusement park',
              intent: 'forecast',
            }),
        },
      });

      const result = await service.understandWeatherQuery(
        'Will tomorrow be good for going to an amusement park in London?',
        refDate,
      );

      expect(result.location).toBe('London');
      expect(result.activity).toBe('amusement park');
      expect(result.intent).toBe('forecast');
      expect(result.resolvedDate).toBeDefined();
    });

    it('should handle queries where location, date, or activity are null without inventing data', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              location: null,
              date: null,
              startTime: null,
              endTime: null,
              activity: null,
              intent: 'forecast',
            }),
        },
      });

      const result = await service.understandWeatherQuery('Hello world', refDate);

      expect(result.location).toBeNull();
      expect(result.activity).toBeNull();
      expect(result.intent).toBe('forecast');
    });

    it('should resolve "next Monday" date expression correctly', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              location: 'Paris',
              date: 'next Monday',
              startTime: '09:00',
              endTime: '17:00',
              activity: 'sightseeing',
              intent: 'forecast',
            }),
        },
      });

      const result = await service.understandWeatherQuery(
        'Is next Monday from 9am to 5pm good for sightseeing in Paris?',
        refDate,
      );

      expect(result.location).toBe('Paris');
      expect(result.date).toBeDefined();
      expect(result.resolvedDate).toBeDefined();
      expect(result.activity).toBe('sightseeing');
    });
  });

  describe('generatePracticalRecommendation', () => {
    const sampleWeather: WeatherData = {
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

    it('should generate a practical recommendation using actual OpenWeather facts and activity context', async () => {
      const mockRecommendationText =
        'Tomorrow looks suitable for an amusement park visit in London. The temperature should be comfortable with a low chance of rain. Carry a light jacket for the evening.';

      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => mockRecommendationText,
        },
      });

      const recommendation = await service.generatePracticalRecommendation({
        originalQuestion: 'Will tomorrow be good for going to an amusement park in London?',
        structuredRequest: {
          location: 'London',
          date: '2026-09-13',
          activity: 'amusement park',
          intent: 'activity_weather_recommendation',
        },
        weather: sampleWeather,
      });

      expect(recommendation).toBe(mockRecommendationText);
      expect(mockGenerateContent).toHaveBeenCalled();
    });

    it('should throw InternalServerErrorException if Gemini returns empty recommendation', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => '',
        },
      });

      await expect(
        service.generatePracticalRecommendation({
          originalQuestion: 'Weather in London?',
          structuredRequest: {
            location: 'London',
            date: '2026-09-13',
            activity: null,
            intent: 'current_weather',
          },
          weather: sampleWeather,
        }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
