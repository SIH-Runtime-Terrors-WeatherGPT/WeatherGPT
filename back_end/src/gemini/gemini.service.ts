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
   * Cleans extracted location string to guarantee activities, prepositions, dates, and noise words are stripped.
   */
  private cleanLocationString(rawLoc: string): string | null {
    if (!rawLoc || typeof rawLoc !== 'string') return null;

    let loc = rawLoc.trim();

    // Strip date expressions e.g. "23 sept", "19 sep", "tomorrow", "today", "on 23 sept"
    loc = loc
      .replace(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?|september|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/gi, ' ')
      .replace(/\b(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/gi, ' ')
      .replace(/\b(today|tomorrow|tonight|weekend|days|day|later|next|this)\b/gi, ' ')
      .replace(/\b\d{1,2}(?:st|nd|rd|th)?\b/gi, ' ')
      .replace(/\b\d{4}\b/g, ' ');

    // Strip conversational text, intentions, and activity noise words
    loc = loc
      .replace(/\b(how|about|a|an|the|trip|to|amusement|park|cricket|match|picnic|tour|visit|flight|travel|weather|forecast|temp|temperature|rain|on|on the|during|for|in|at|wish|want|would|like|is|it|suitable|suitability|going|planning|plan|plans|give|show|tell|me|here|area|location|place|near|current|my)\b/gi, ' ')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!loc) return null;

    const genericNoise = new Set([
      'give', 'show', 'tell', 'me', 'us', 'here', 'this', 'area', 'location',
      'place', 'near', 'current', 'my', 'the', 'weather', 'temp', 'temperature'
    ]);
    if (genericNoise.has(loc.toLowerCase())) return null;

    return loc
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Helper to extract explicit date expressions from prompt text
   */
  private extractDateFromPromptText(text: string): string | null {
    const lower = text.toLowerCase();
    if (lower.includes('day after tomorrow')) return 'day after tomorrow';
    if (lower.includes('tomorrow')) return 'tomorrow';
    if (lower.includes('tonight')) return 'tonight';
    if (lower.includes('this weekend') || lower.includes('weekend')) return 'this weekend';

    const relativeMatch = text.match(/\b(?:after|in)\s+(\d{1,2})\s+days?\b|\b(\d{1,2})\s+days?\s+(?:later|from now|after)\b/i);
    if (relativeMatch) {
      return relativeMatch[0].trim();
    }

    const dateMatch = text.match(/\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?|september|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+\d{4})?|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?|september|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s+\d{4})?|\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{4})?|\d{4}-\d{2}-\d{2})\b/i);
    if (dateMatch) {
      return dateMatch[0].trim();
    }
    return null;
  }

  /**
   * Helper to extract date ranges (e.g. "20 sep to 25 sep", "from 15th oct to 20th oct", "next 5 days")
   */
  private extractDateRangeFromPromptText(text: string): { startDate: string | null; endDate: string | null; isDateRange: boolean } {
    const lower = text.toLowerCase().trim();

    // Range Pattern 1: "from 20 sep to 25 sep", "20 to 25 sep", "between Oct 15 and Oct 20"
    const rangeMatch = lower.match(/\b(?:from|between)?\s*(\d{1,2}(?:st|nd|rd|th)?(?:\s+[a-z]+)?|\b(?:today|tomorrow))\s+(?:to|till|until|through|and|-)\s+(\d{1,2}(?:st|nd|rd|th)?(?:\s+[a-z]+)?|\b(?:tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday))\b/i);
    if (rangeMatch) {
      return {
        startDate: rangeMatch[1].trim(),
        endDate: rangeMatch[2].trim(),
        isDateRange: true,
      };
    }

    // Range Pattern 2: "next 5 days", "for 5 days"
    const nextDaysMatch = lower.match(/\b(?:for\s+)?(?:the\s+)?next\s+(\d{1,2})\s+days?\b/i);
    if (nextDaysMatch) {
      const numDays = parseInt(nextDaysMatch[1], 10);
      return {
        startDate: 'today',
        endDate: `after ${numDays} days`,
        isDateRange: true,
      };
    }

    return {
      startDate: null,
      endDate: null,
      isDateRange: false,
    };
  }

  /**
   * Fallback rule-based NLU intent extraction if Gemini API is unreachable or rate-limited.
   */
  private fallbackExtractWeatherIntent(promptText: string): WeatherIntentSchema {
    const text = promptText.trim();
    const lower = text.toLowerCase();

    // 1. Extract date or date range first so date tokens are not confused with location
    const dateRange = this.extractDateRangeFromPromptText(text);
    const rawDate = this.extractDateFromPromptText(text) || dateRange.startDate || 'today';

    const resolvedRange = this.dateResolverService.resolveDateRange(dateRange.startDate || rawDate, dateRange.endDate);
    const startDate = resolvedRange.startDate || 'today';
    const endDate = resolvedRange.endDate || null;
    const isDateRange = dateRange.isDateRange || Boolean(endDate && endDate !== startDate);
    const date = isDateRange && endDate ? `${startDate} to ${endDate}` : startDate;

    // Clean conversational prefix & suffix noise
    let cleanTextForLoc = text
      .replace(/\b(i wish to visit|i want to visit|planning to visit|is it suitable|can i visit|good weather for|trip to|how is the weather in|weather in|weather at)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (rawDate !== 'today') {
      cleanTextForLoc = cleanTextForLoc.replace(new RegExp(rawDate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
    }
    cleanTextForLoc = cleanTextForLoc
      .replace(/\b(on|on the|during|for|in|at)\b/gi, ' ')
      .replace(/\b\d{4}\b/g, '')
      .replace(/\b\d{1,2}[\/\-]\d{1,2}\b/g, '')
      .replace(/\b\d{1,2}(?:st|nd|rd|th)?\b/gi, '')
      .trim();

    // 2. Extract target_place & nearby_reference
    let target_place: string | null = null;
    let nearby_reference: string | null = null;

    const nearMatch = cleanTextForLoc.match(/(.+?)\s+\bnear\b\s+(.+)/i);
    if (nearMatch) {
      target_place = this.cleanLocationString(nearMatch[1]);
      nearby_reference = this.cleanLocationString(nearMatch[2]);
    } else {
      const stopwords = new Set([
        'weather', 'rain', 'temperature', 'temp', 'forecast', 'today', 'tomorrow', 'tonight',
        'morning', 'afternoon', 'evening', 'night', 'this', 'weekend', 'in', 'at', 'for', 'near',
        'is', 'it', 'will', 'there', 'be', 'suitability', 'suitable', 'cricket', 'match', 'varsad',
        'aavse', 'kale', 'su', 'che', 'kavo', 'kedi', 'ma', 'per', 'how', 'what', 'when', 'where',
        'the', 'a', 'an', 'should', 'i', 'you', 'can', 'give', 'show', 'tell', 'me', 'about',
        'with', 'of', 'and', 'or', 'to', 'please', 'now', 'current', 'humidity', 'wind', 'speed',
        'clouds', 'cloud', 'sky', 'hot', 'cold', 'warm', 'climate', 'city', 'on',
        'after', 'days', 'day', 'later', 'trip', 'amusement', 'park', 'wish', 'visit', 'want',
      ]);

      const cleanedWords = cleanTextForLoc
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 1 && !stopwords.has(w.toLowerCase()));

      if (cleanedWords.length > 0) {
        target_place = this.cleanLocationString(cleanedWords.join(' '));
      }
    }

    const combinedLoc = [target_place, nearby_reference].filter(Boolean).join(', ') || target_place;

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
    else if (lower.includes('visit') || lower.includes('trip')) activity = 'sightseeing / visit';

    // 5. Requested data
    const requestedData: string[] = [];
    if (lower.includes('rain') || lower.includes('umbrella') || lower.includes('precipitation')) {
      requestedData.push('rain', 'precipitation_probability');
    }
    if (lower.includes('hot') || lower.includes('temp') || lower.includes('cold') || lower.includes('weather') || lower.includes('suitable')) {
      requestedData.push('temperature', 'weather_condition');
    }
    if (lower.includes('wind') || lower.includes('windy')) {
      requestedData.push('wind_speed', 'wind_direction');
    }
    if (requestedData.length === 0) {
      requestedData.push('temperature', 'weather_condition');
    }

    return {
      target_place,
      nearby_reference,
      location: combinedLoc,
      intent: isDateRange || date !== 'today' || lower.includes('forecast') ? 'forecast' : 'current',
      date,
      startDate,
      endDate,
      isDateRange,
      time_period: timePeriod,
      activity,
      requested_data: Array.from(new Set(requestedData)),
    };
  }

  /**
   * Gemini Weather Intent Extraction
   * Uses Gemini AI Model directly to break down the prompt parameters into structured JSON.
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

    const systemInstruction = `You are the WeatherGPT natural language entity & location extraction engine powered by Google Gemini.
Your task is to break down ANY user prompt (simple, complex, multi-word, implicit, regional, landmark-based, activity-focused) into structured JSON parameters.
Do NOT answer the user's question. ONLY extract the structured parameters.

ENTITY & LOCATION EXTRACTION INSTRUCTIONS:
- target_place: Primary named location, landmark, temple, monument, beach, park, stadium, airport, neighborhood, mountain, lake, region, or city name mentioned (e.g. "Sun Temple", "Taj Mahal", "Baga Beach", "Wakad", "Chinnaswamy Stadium", "Jamnagar", "Mumbai", "London", "Tokyo"). Do NOT include prepositions ("in", "near", "at", "for"), date words, or activity names.
- nearby_reference: Nearby reference city, district, or parent region mentioned alongside the target place (e.g. for "Sun Temple near Mehsana", target_place is "Sun Temple" and nearby_reference is "Mehsana"; for "Wakad in Pune", target_place is "Wakad" and nearby_reference is "Pune"). Else null.
- country: ISO 2-letter country code if mentioned or inferable (e.g. "IN", "US", "GB", "FR"), else null.
- intent: "current" | "forecast" | "alerts"
- date: Exact date or natural expression mentioned in prompt (e.g. "today", "tomorrow", "day after tomorrow", "this weekend", "next Monday", "20th october", "20 sep", "after 4 days"), or null if not specified.
- dateOffset: Integer number of days relative to today if explicitly stated (e.g. 1 for tomorrow, 2 for day after tomorrow, 4 for after 4 days), else null.
- time_period: "morning" | "afternoon" | "evening" | "night" | null
- activity: Specific activity, trip, or event mentioned (e.g. "sightseeing", "cricket match", "biking", "beach trip", "picnic", "carrying umbrella", "wedding", "outdoor event"), else null.
- requested_data: Array of relevant weather parameters requested: ["temperature", "rain", "precipitation_probability", "wind_speed", "weather_condition", "humidity", "uv_index", "pressure"].

Return valid JSON matching this schema:
{
  "target_place": "string or null",
  "nearby_reference": "string or null",
  "country": "string or null",
  "intent": "current | forecast | alerts",
  "date": "string or null",
  "dateOffset": "number or null",
  "time_period": "string or null",
  "activity": "string or null",
  "requested_data": ["string"]
}`;

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

        const rawTarget = typeof parsed.target_place === 'string' && parsed.target_place.trim()
          ? parsed.target_place.trim()
          : (typeof parsed.location === 'string' && parsed.location.trim() ? parsed.location.trim() : null);
        const target_place = rawTarget ? this.cleanLocationString(rawTarget) : null;

        const rawRef = typeof parsed.nearby_reference === 'string' && parsed.nearby_reference.trim()
          ? parsed.nearby_reference.trim()
          : null;
        const nearby_reference = rawRef ? this.cleanLocationString(rawRef) : null;

        const country = typeof parsed.country === 'string' ? parsed.country.trim() : null;

        let rawDateStr = typeof parsed.date === 'string' && parsed.date.trim() ? parsed.date.trim() : null;
        if (typeof parsed.dateOffset === 'number' && !isNaN(parsed.dateOffset)) {
          rawDateStr = `after ${parsed.dateOffset} days`;
        }
        if (!rawDateStr || rawDateStr === 'today') {
          const promptDate = this.extractDateFromPromptText(promptText);
          if (promptDate) {
            rawDateStr = promptDate;
          }
        }
        if (!rawDateStr) {
          rawDateStr = 'today';
        }

        const dateRange = this.extractDateRangeFromPromptText(promptText);
        const rawStart = typeof parsed.startDate === 'string' && parsed.startDate.trim()
          ? parsed.startDate.trim()
          : (dateRange.startDate || rawDateStr);
        const rawEnd = typeof parsed.endDate === 'string' && parsed.endDate.trim()
          ? parsed.endDate.trim()
          : dateRange.endDate;

        const resolvedRange = this.dateResolverService.resolveDateRange(rawStart, rawEnd);
        const startDate = resolvedRange.startDate || this.dateResolverService.resolveTemporal({ date: rawDateStr }).date || rawDateStr;
        const endDate = resolvedRange.endDate || null;
        const isDateRange = Boolean(parsed.isDateRange || dateRange.isDateRange || (endDate && endDate !== startDate));

        const finalDateStr = isDateRange && endDate ? `${startDate} to ${endDate}` : startDate;

        const intent = ['current', 'forecast', 'alerts'].includes(parsed.intent)
          ? parsed.intent
          : (isDateRange || startDate !== 'today' ? 'forecast' : 'current');

        const combinedLoc = [target_place, nearby_reference].filter(Boolean).join(', ') || target_place;

        this.logger.log(
          `Gemini API Model [${modelName}] extracted intent: target_place="${target_place}", nearby_ref="${nearby_reference}", date="${finalDateStr}" (isDateRange=${isDateRange})`,
        );

        return {
          target_place,
          nearby_reference,
          location: combinedLoc,
          country,
          intent,
          date: finalDateStr,
          startDate,
          endDate,
          isDateRange,
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
