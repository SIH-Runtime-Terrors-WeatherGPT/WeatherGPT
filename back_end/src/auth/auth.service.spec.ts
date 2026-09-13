import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: any;
  let jwtService: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const mockPrisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    const mockJwt = {
      sign: jest.fn().mockReturnValue('mock_jwt_token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get(PrismaService);
    jwtService = module.get(JwtService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('should successfully register a new user and return safe user object (no passwordHash)', async () => {
      prismaService.user.findUnique.mockResolvedValueOnce(null);
      prismaService.user.create.mockResolvedValueOnce({
        id: 'user_123',
        name: 'Dhruv',
        email: 'dhruv@example.com',
        passwordHash: 'hashed_password_string',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.register({
        name: 'Dhruv',
        email: 'dhruv@example.com',
        password: 'password123',
      });

      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'dhruv@example.com' },
      });
      expect(result).toEqual({
        accessToken: 'mock_jwt_token',
        user: {
          id: 'user_123',
          name: 'Dhruv',
          email: 'dhruv@example.com',
        },
      });
      expect((result.user as any).passwordHash).toBeUndefined();
    });

    it('should throw ConflictException if email is already registered', async () => {
      prismaService.user.findUnique.mockResolvedValueOnce({
        id: 'existing_user',
        email: 'dhruv@example.com',
      });

      await expect(
        service.register({
          name: 'Dhruv',
          email: 'dhruv@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should successfully authenticate user with valid credentials and return JWT accessToken', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);

      prismaService.user.findUnique.mockResolvedValueOnce({
        id: 'user_123',
        name: 'Dhruv',
        email: 'dhruv@example.com',
        passwordHash: hashedPassword,
      });

      const response = await service.login({
        email: 'dhruv@example.com',
        password: 'password123',
      });

      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'user_123',
        email: 'dhruv@example.com',
      });

      expect(response).toEqual({
        accessToken: 'mock_jwt_token',
        user: {
          id: 'user_123',
          name: 'Dhruv',
          email: 'dhruv@example.com',
        },
      });
      expect((response.user as any).passwordHash).toBeUndefined();
    });

    it('should throw UnauthorizedException if user is nonexistent', async () => {
      prismaService.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.login({
          email: 'nonexistent@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if password does not match hash', async () => {
      const hashedPassword = await bcrypt.hash('correct_password', 10);

      prismaService.user.findUnique.mockResolvedValueOnce({
        id: 'user_123',
        name: 'Dhruv',
        email: 'dhruv@example.com',
        passwordHash: hashedPassword,
      });

      await expect(
        service.login({
          email: 'dhruv@example.com',
          password: 'wrong_password',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
