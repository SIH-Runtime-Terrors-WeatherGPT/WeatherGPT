import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ChatService, ChatResponse } from './chat.service';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';
import { GetHistoryQueryDto } from './dto/get-history-query.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * POST /api/chat
   * Protected endpoint for WeatherGPT natural language queries.
   * Gets userId exclusively from the validated JWT token.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async createMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateChatMessageDto,
  ): Promise<ChatResponse> {
    return this.chatService.processChatMessage(user.id, dto);
  }

  /**
   * GET /api/chat/history
   * Protected endpoint: Retrieves chat history records ONLY for the authenticated user.
   * Gets userId strictly from the validated JWT token. Sorts newest chats first with pagination.
   */
  @Get('history')
  async getHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetHistoryQueryDto,
  ) {
    return this.chatService.getUserChatHistory(user.id, query);
  }
}
