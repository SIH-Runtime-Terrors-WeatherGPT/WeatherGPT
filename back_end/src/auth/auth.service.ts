import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './strategies/jwt.strategy';

const SALT_ROUNDS = 12;

export interface SafeUser {
  id: string;
  name: string;
  email: string;
}

export interface LoginResponse {
  accessToken: string;
  user: SafeUser;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // ─── Register ────────────────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<SafeUser> {
    const { name, email, password } = dto;

    // 1. Duplicate-email guard
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    // 2. Hash — plaintext password is never persisted
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // 3. Persist
    try {
      const user = await this.prisma.user.create({
        data: { name, email, passwordHash },
      });

      return { id: user.id, name: user.name, email: user.email };
    } catch (error) {
      this.logger.error('Failed to create user', error);
      throw new InternalServerErrorException('Could not create user');
    }
  }

  // ─── Login ───────────────────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<LoginResponse> {
    const { email, password } = dto;
    const normEmail = email.trim().toLowerCase();

    // Built-in Demo Account Support for SIH 2026 Judges
    if (
      (normEmail === 'demo@weathergpt.com' || normEmail === 'demo@sih2026.com' || normEmail === 'demo@example.com') &&
      password === 'Password123!'
    ) {
      const demoId = '66e2c3a9f1a2b3c4d5e6f7a8'; // Valid 24-char hex ObjectId
      const payload: JwtPayload = { sub: demoId, email: normEmail };
      const accessToken = this.jwtService.sign(payload);

      return {
        accessToken,
        user: { id: demoId, name: 'SIH 2026 Judge (Demo)', email: normEmail },
      };
    }

    // 1. Find user in MongoDB
    let user;
    try {
      user = await this.prisma.user.findUnique({ where: { email: normEmail } });
    } catch (err: any) {
      this.logger.warn(`Prisma user lookup warning: ${err?.message}`);
    }

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // 2. Compare password against stored hash
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // 3. Sign JWT
    const payload: JwtPayload = { sub: user.id, email: user.email };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: { id: user.id, name: user.name, email: user.email },
    };
  }

  // ─── Profile ─────────────────────────────────────────────────────────────────

  async getProfile(userId: string): Promise<SafeUser> {
    if (userId === '66e2c3a9f1a2b3c4d5e6f7a8') {
      return { id: userId, name: 'SIH 2026 Judge (Demo)', email: 'demo@weathergpt.com' };
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return { id: userId, name: 'WeatherGPT User', email: 'user@weathergpt.com' };
    }

    return { id: user.id, name: user.name, email: user.email };
  }
}
