import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConversationDto } from './dto/create-conversation.dto';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves all conversations for the authenticated user, newest first.
   */
  async getUserConversations(userId: string) {
    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  /**
   * Creates a new conversation for the authenticated user.
   */
  async createConversation(userId: string, dto?: CreateConversationDto) {
    const title = dto?.title?.trim() || 'New Weather Chat';
    return this.prisma.conversation.create({
      data: {
        userId,
        title,
      },
    });
  }

  /**
   * Retrieves a specific conversation with all messages for the authenticated user.
   * Throws NotFoundException if conversation does not exist or belongs to another user.
   */
  async getConversationById(userId: string, id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException('Access denied to this conversation');
    }

    return conversation;
  }

  /**
   * Deletes a conversation owned by the authenticated user.
   */
  async deleteConversation(userId: string, id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException('Access denied to delete this conversation');
    }

    await this.prisma.conversation.delete({
      where: { id },
    });

    return { success: true, message: 'Conversation deleted successfully' };
  }

  /**
   * Adds a user or assistant message to a conversation and updates conversation timestamp.
   */
  async addMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    intent?: any,
    weatherSnapshot?: any,
  ) {
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        role,
        content,
        intent: intent || null,
        weatherSnapshot: weatherSnapshot || null,
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return message;
  }
}
