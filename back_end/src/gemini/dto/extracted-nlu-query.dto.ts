import { IsOptional, IsString } from 'class-validator';

export class ExtractedNluQueryDto {
  @IsOptional()
  @IsString()
  location!: string | null;

  @IsOptional()
  @IsString()
  date!: string | null;

  @IsOptional()
  @IsString()
  startTime!: string | null;

  @IsOptional()
  @IsString()
  endTime!: string | null;

  @IsOptional()
  @IsString()
  activity!: string | null;

  @IsString()
  intent!: string;
}
