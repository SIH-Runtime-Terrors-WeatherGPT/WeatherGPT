import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { WeatherData } from '../weather/weather.types';

@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs = 8000; // 8 second timeout limit

  constructor(
    private readonly http: HttpService,
    configService: ConfigService,
  ) {
    this.baseUrl = configService
      .get<string>('OLLAMA_BASE_URL', 'http://localhost:11434')
      .replace(/\/$/, '');
    this.model = configService.get<string>('OLLAMA_MODEL', 'llama3.2');
  }

  /**
   * Generates a conversational natural-language answer using Ollama API based ONLY on supplied weather data.
   * Returns null if Ollama is unreachable or times out, triggering graceful fallback in WeatherService.
   */
  async generateAnswer(
    userPrompt: string,
    weatherData: WeatherData,
    structuredIntent?: any,
  ): Promise<string | null> {
    const systemPrompt = `You are the conversational response engine for WeatherGPT.

Answer the user's weather question using ONLY the supplied weather data.
The supplied weather data is the single source of truth.

CRITICAL CONSTRAINTS:
1. Do NOT invent or assume:
   - temperature
   - rainfall / precipitation probability
   - humidity
   - wind speed / direction
   - weather conditions
   - alerts / forecasts
2. If requested information is unavailable in the supplied data, clearly say it is unavailable.
3. Keep responses concise, useful, natural, and friendly (2 to 3 sentences).
4. When appropriate, provide practical decision support (e.g. whether carrying an umbrella or outdoor activities appear suitable).`;

    const promptText = `User question: "${userPrompt}"

Target Location: ${weatherData.location}
Requested Date: ${weatherData.date}
Condition: ${weatherData.condition}
Current Temperature: ${weatherData.temperature}°C
High Temperature: ${weatherData.temperatureHigh}°C
Low Temperature: ${weatherData.temperatureLow}°C
Rain Probability: ${weatherData.rainProbability}%
Wind Speed: ${weatherData.windSpeed} m/s
Humidity: ${weatherData.humidity}%
${structuredIntent?.activity ? `Requested Activity: ${structuredIntent.activity}` : ''}`;

    try {
      this.logger.log(`Calling local Ollama model "${this.model}" at ${this.baseUrl}...`);
      const response = await firstValueFrom(
        this.http
          .post(
            `${this.baseUrl}/api/generate`,
            {
              model: this.model,
              system: systemPrompt,
              prompt: promptText,
              stream: false,
            },
            { headers: { 'Content-Type': 'application/json' } },
          )
          .pipe(timeout(this.timeoutMs)),
      );

      const responseText = response.data?.response?.trim();
      if (responseText) {
        this.logger.log(`Successfully received answer from Ollama model "${this.model}".`);
        return responseText;
      }
      return null;
    } catch (err: any) {
      this.logger.warn(
        `Ollama API unavailable or timed out (${err?.message}). Falling back gracefully.`,
      );
      return null;
    }
  }
}
