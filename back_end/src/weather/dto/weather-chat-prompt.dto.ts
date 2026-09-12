import { IsOptional, IsString } from 'class-validator';

export class MapLocationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  lat?: number;

  @IsOptional()
  lon?: number;
}

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

  @IsOptional()
  mapLocation?: MapLocationDto;

  get userPrompt(): string {
    return (this.prompt || this.message || '').trim();
  }
}
