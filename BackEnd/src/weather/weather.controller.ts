import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { WeatherService } from './weather.service';
import { WeatherChatPromptDto } from './dto/weather-chat-prompt.dto';

@Controller('weather')
export class WeatherController {
  constructor(private readonly weatherService: WeatherService) {}

  /**
   * POST /weather/chat (and /api/weather/chat)
   * Main WeatherGPT conversational chat pipeline endpoint.
   * Gets userId exclusively from the validated JWT token.
   */
  @Post('chat')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async weatherChat(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: WeatherChatPromptDto,
  ) {
    const promptText = dto.userPrompt;
    if (!promptText) {
      throw new BadRequestException('Prompt must not be empty.');
    }
    return this.weatherService.processWeatherQuery(
      promptText,
      user.id,
      dto.conversationId,
    );
  }

  /**
   * GET /weather/city/:city
   * Public endpoint to fetch weather summary for a specific city.
   */
  @Get('city/:city')
  async getWeatherByCity(@Param('city') city: string) {
    return this.weatherService.getWeatherByCity(city);
  }
}
