import { IsNotEmpty, IsString } from 'class-validator';

export class CreateChatMessageDto {
  @IsString()
  @IsNotEmpty({ message: 'Chat message must not be empty.' })
  message!: string;
}
