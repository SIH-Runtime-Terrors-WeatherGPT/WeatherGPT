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




export interface WeatherIntentSchema {
  target_place?: string | null;
  nearby_reference?: string | null;
  location: string | null;
  country?: string | null;
  intent: 'current' | 'forecast' | 'alerts';
  date?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isDateRange?: boolean;
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
    const jsonBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (jsonBlockMatch) {
      cleaned = jsonBlockMatch[1].trim();
    } else {
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1).trim();
      }
    }
    return cleaned;
  }

  /**
   * Gemini Weather Intent Extraction
   * Uses Google Gemini AI Model directly to break down ANY prompt into structured JSON.
   */
  async extractWeatherIntent(
    promptText: string,
    referenceDate: Date = new Date(),
  ): Promise<WeatherIntentSchema> {
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

    const now = referenceDate || new Date();
    const todayISO = now.toISOString().split('T')[0];
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });

    const systemInstruction = `You are the WeatherGPT natural language entity & parameter extraction engine powered by Google Gemini.
Your task is to break down ANY user prompt (simple, complex, multi-word, implicit, regional, landmark-based, activity-focused, or multilingual) into structured JSON parameters.
Do NOT answer the user's question. ONLY extract the structured parameters.

CURRENT REFERENCE TIME:
- Today's Date: ${dayOfWeek}, ${todayISO}
- Reference ISO Date (YYYY-MM-DD): ${todayISO}

CRITICAL PARAMETER EXTRACTION INSTRUCTIONS:
- target_place: Primary named location, landmark, temple, monument, beach, park, stadium, airport, neighborhood, mountain, lake, region, or city name mentioned in prompt (e.g. "Sun Temple", "Taj Mahal", "Baga Beach", "Wakad", "Chinnaswamy Stadium", "Jamnagar", "Mumbai", "London", "Tokyo"). If no specific place is mentioned, return null. Do NOT include prepositions ("in", "near", "at", "for"), date words, or activity names.
- nearby_reference: Nearby reference city, district, state, or parent region if mentioned alongside target_place (e.g. for "Sun Temple near Mehsana", target_place is "Sun Temple" and nearby_reference is "Mehsana"; for "Wakad in Pune", target_place is "Wakad" and nearby_reference is "Pune"). Else null.
- country: ISO 2-letter country code if mentioned or inferable (e.g. "IN", "US", "GB", "FR"), else null.
- location: Full combined location string (e.g. "Sun Temple, Mehsana" or "Wakad, Pune" or "Ahmedabad" or "London"). Else null if no place is mentioned.
- intent: "current" | "forecast" | "alerts"
- date: Natural expression or calculated date (e.g. "today", "tomorrow", "this weekend", "2026-09-15"). Default to "today" if unstated.
- startDate: Start date in YYYY-MM-DD format (calculated relative to reference date ${todayISO}). E.g. for "tomorrow", calculate ${todayISO} + 1 day. Default to ${todayISO} if unstated.
- endDate: End date in YYYY-MM-DD format if date range or multi-day query, else null.
- isDateRange: Boolean true if query covers a multi-day date range, else false.
- time_period: "morning" | "afternoon" | "evening" | "night" | null
- activity: Specific activity, trip, or event mentioned (e.g. "sightseeing", "cricket match", "biking", "beach trip", "picnic", "carrying umbrella", "wedding", "outdoor event"), else null.
- requested_data: Array of relevant weather parameters requested: ["temperature", "rain", "precipitation_probability", "wind_speed", "weather_condition", "humidity", "uv_index", "pressure"].

MULTILINGUAL & REGIONAL LOCATION MAPPINGS:
- Map regional/colloquial city names to standard names (e.g., "Amdavad" -> "Ahmedabad", "Bombay" -> "Mumbai", "Madras" -> "Chennai", "Calcutta" -> "Kolkata", "Dilli" -> "Delhi").

Return valid JSON matching this schema:
{
  "target_place": "string or null",
  "nearby_reference": "string or null",
  "country": "string or null",
  "location": "string or null",
  "intent": "current | forecast | alerts",
  "date": "string or null",
  "startDate": "string or null (YYYY-MM-DD)",
  "endDate": "string or null (YYYY-MM-DD)",
  "isDateRange": boolean,
  "time_period": "morning | afternoon | evening | night | null",
  "activity": "string or null",
  "requested_data": ["string"]
}`;

    const configuredModel = this.configService.get<string>('GEMINI_MODEL')?.trim();
    const candidateModels = Array.from(
      new Set([
        ...(configuredModel ? [configuredModel] : []),
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-1.5-pro',
        'gemini-2.0-flash-lite',
        'gemini-1.5-pro-latest',
        'gemini-1.5-flash-latest',
        'gemini-2.0-flash-exp',
      ]),
    );

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

        const target_place =
          typeof parsed.target_place === 'string' && parsed.target_place.trim()
            ? parsed.target_place.trim()
            : typeof parsed.location === 'string' && parsed.location.trim()
            ? parsed.location.trim()
            : null;

        const nearby_reference =
          typeof parsed.nearby_reference === 'string' && parsed.nearby_reference.trim()
            ? parsed.nearby_reference.trim()
            : null;

        const country = typeof parsed.country === 'string' && parsed.country.trim() ? parsed.country.trim() : null;
        const date = typeof parsed.date === 'string' && parsed.date.trim() ? parsed.date.trim() : 'today';
        const startDate = typeof parsed.startDate === 'string' && parsed.startDate.trim() ? parsed.startDate.trim() : todayISO;
        const endDate = typeof parsed.endDate === 'string' && parsed.endDate.trim() ? parsed.endDate.trim() : null;
        const isDateRange = Boolean(parsed.isDateRange || (endDate && endDate !== startDate));

        const intent: 'current' | 'forecast' | 'alerts' = ['current', 'forecast', 'alerts'].includes(parsed.intent)
          ? parsed.intent
          : isDateRange || date !== 'today'
          ? 'forecast'
          : 'current';

        const rawLocation = typeof parsed.location === 'string' && parsed.location.trim() ? parsed.location.trim() : null;
        const combinedLoc =
          [target_place, nearby_reference].filter(Boolean).join(', ') || target_place || rawLocation || null;

        this.logger.log(
          `Gemini API Model [${modelName}] extracted intent: location="${combinedLoc}", date="${date}", intent="${intent}"`,
        );

        return {
          target_place,
          nearby_reference,
          location: combinedLoc,
          country,
          intent,
          date,
          startDate,
          endDate,
          isDateRange,
          time_period: ['morning', 'afternoon', 'evening', 'night'].includes(parsed.time_period)
            ? parsed.time_period
            : null,
          activity: typeof parsed.activity === 'string' ? parsed.activity.trim() : null,
          requested_data: Array.isArray(parsed.requested_data) && parsed.requested_data.length > 0
            ? parsed.requested_data
            : ['temperature', 'weather_condition'],
        };
      } catch (err: any) {
        this.logger.warn(`Gemini model "${modelName}" failed: ${err?.message}`);
      }
    }

    this.logger.warn(
      `All Gemini AI models failed or unconfigured for prompt breakdown: "${promptText}". Returning default schema.`,
    );

    return {
      target_place: null,
      nearby_reference: null,
      location: null,
      country: null,
      intent: 'current',
      date: 'today',
      startDate: todayISO,
      endDate: null,
      isDateRange: false,
      time_period: null,
      activity: null,
      requested_data: ['temperature', 'weather_condition'],
    };
  }

  /**
   * Understands natural-language weather questions and extracts structured NLU data.
   */
  async understandWeatherQuery(
    userMessage: string,
    referenceDate: Date = new Date(),
  ): Promise<ResolvedNluQuery> {
    const extractedIntent = await this.extractWeatherIntent(userMessage, referenceDate);
    const resolvedDate = extractedIntent.startDate || referenceDate.toISOString().split('T')[0];

    return {
      location: extractedIntent.location,
      date: extractedIntent.date || null,
      resolvedDate,
      startTime: null,
      endTime: null,
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

    const systemInstruction = `You are WeatherGPT, a creative, warm, friendly, and practical AI weather assistant!
Generate a concise, helpful recommendation for the user based STRICTLY on the actual weather facts provided by OpenWeather.

CRITICAL CONSTRAINTS:
1. Do NOT invent, assume, or modify any weather facts (temperature, rain chance, wind speed, condition, humidity).
2. Base all weather statements ONLY on the provided OpenWeather facts.
3. DIVERSIFY YOUR TEXT FORMAT AND STYLE EACH TIME: Vary your opening greeting, phrasing, sentence structure, and vocabulary on every single turn so no two responses share the same repetitive template!
4. Keep the tone warm, conversational, friendly, and helpful (2 to 3 sentences max).
5. Explicitly address the user's requested activity (e.g. "${structuredRequest?.activity || 'general plans'}") with practical advice (e.g. carrying an umbrella, light layers, sunscreen).`;

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

Generate a unique, friendly, and practical response now.`;

    const configuredModel = this.configService.get<string>('GEMINI_MODEL')?.trim();
    const candidateModels = Array.from(
      new Set([
        ...(configuredModel ? [configuredModel] : []),
        'gemini-2.5-pro',
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-pro',
        'gemini-1.5-pro-latest',
        'gemini-1.5-flash',
        'gemini-1.5-flash-latest',
        'gemini-2.0-flash-exp',
      ])
    );
    let lastError: any = null;
    let emptyResponseReturned = false;

    for (const modelName of candidateModels) {
      try {
        const text = await this.executeWithTimeout('generatePracticalRecommendation', async (ai) => {
          const model = ai.getGenerativeModel({
            model: modelName,
            generationConfig: {
              temperature: 0.85,
              topP: 0.9,
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

    // Varied, non-repetitive grounded fallback response strictly based on supplied OpenWeather facts
    const rainProb = weather.rainProbability ?? 0;
    const isRainy = rainProb >= 40;

    const greetings = isRainy
      ? [
          `🌧️ Rain alert for ${weather.location}!`,
          `☔ Heading out in ${weather.location}? Expect some rain!`,
          `🌧️ Keep your rain gear ready in ${weather.location}.`,
          `🌦️ Showers are expected in ${weather.location} for ${weather.date}.`,
        ]
      : [
          `☀️ Here's the latest forecast for ${weather.location}:`,
          `🌤️ Weather look for ${weather.location} on ${weather.date}:`,
          `🌡️ Current conditions in ${weather.location}:`,
          `✨ Here's what to expect in ${weather.location}:`,
        ];

    const chosenGreeting = greetings[Math.floor(Math.random() * greetings.length)];

    const rainPhrasings = isRainy
      ? [
          `There's a ${rainProb}% chance of precipitation with ${weather.condition}. Bringing an umbrella is highly recommended!`,
          `Precipitation chance is around ${rainProb}% with ${weather.condition}. Grab a rain jacket or umbrella just in case.`,
          `You'll likely see ${weather.condition} with a ${rainProb}% chance of rainfall. Plan outdoor activities carefully!`,
        ]
      : [
          `Expect ${weather.condition} with temperatures near ${weather.temperature}°C (High: ${weather.temperatureHigh}°C, Low: ${weather.temperatureLow}°C) and a low rain chance of ${rainProb}%.`,
          `Sky condition is ${weather.condition} at ${weather.temperature}°C (High ${weather.temperatureHigh}°C / Low ${weather.temperatureLow}°C). Rain probability stays low at ${rainProb}%.`,
          `Conditions will be ${weather.condition}. Temperatures range between ${weather.temperatureLow}°C and ${weather.temperatureHigh}°C with an average around ${weather.temperature}°C.`,
        ];

    const chosenRainDetails = rainPhrasings[Math.floor(Math.random() * rainPhrasings.length)];

    const windPhrasings = weather.windSpeed
      ? [
          ` Wind speed will average ${weather.windSpeed} m/s.`,
          ` Winds are blowing at around ${weather.windSpeed} m/s.`,
          ` Expect a breeze around ${weather.windSpeed} m/s.`,
        ]
      : [''];

    const chosenWindDetails = windPhrasings[Math.floor(Math.random() * windPhrasings.length)];

    const closings = [
      ' Have a wonderful day!',
      ' Stay safe and enjoy your day!',
      ' Wishing you great weather ahead!',
      ' Take care out there!',
      ' Stay comfortable!',
    ];
    const chosenClosing = closings[Math.floor(Math.random() * closings.length)];

    return `${chosenGreeting} ${chosenRainDetails}${chosenWindDetails}${chosenClosing}`;
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
