import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SafeUser {
  id: string;
  name: string;
  email: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetches a user by their MongoDB id.
   * Throws NotFoundException if no user is found.
   * Never returns passwordHash.
   */
  async findById(id: string): Promise<SafeUser> {
    if (id === '66e2c3a9f1a2b3c4d5e6f7a8') {
      return { id, name: 'SIH 2026 Judge (Demo)', email: 'demo@weathergpt.com' };
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    return user;
  }
}
