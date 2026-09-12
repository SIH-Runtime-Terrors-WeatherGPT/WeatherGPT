import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UsersService', () => {
  let service: UsersService;
  let prismaService: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prismaService = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findById', () => {
    it('should return safe user object (id, name, email) without passwordHash', async () => {
      prismaService.user.findUnique.mockResolvedValueOnce({
        id: 'user_123',
        name: 'Dhruv',
        email: 'dhruv@example.com',
      });

      const user = await service.findById('user_123');

      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user_123' },
        select: {
          id: true,
          name: true,
          email: true,
        },
      });
      expect(user).toEqual({
        id: 'user_123',
        name: 'Dhruv',
        email: 'dhruv@example.com',
      });
    });

    it('should throw NotFoundException if user ID is not found', async () => {
      prismaService.user.findUnique.mockResolvedValueOnce(null);

      await expect(service.findById('nonexistent_id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
