import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UsersService, SafeUser } from './users.service';

@Controller(['users', 'v1/users'])
@UseGuards(JwtAuthGuard) // All routes in this controller require a valid JWT
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /api/users/me
   *
   * Returns the authenticated user's profile.
   * - userId is extracted ONLY from the verified JWT (via @CurrentUser).
   * - Body / query params are never trusted for identity.
   * - passwordHash is never returned.
   * - Missing or invalid JWT → 401 Unauthorized (handled by JwtAuthGuard).
   * - JWT valid but user deleted → 404 Not Found.
   */
  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser): Promise<SafeUser> {
    return this.usersService.findById(user.id);
  }
}
