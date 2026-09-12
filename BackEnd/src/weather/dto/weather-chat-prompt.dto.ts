import { IsOptional, IsString } from 'class-validator';

export class WeatherChatPromptDto {
  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  get userPrompt(): string {
    return (this.prompt || this.message || '').trim();
  }
}
