import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';

/**
 * Parameter decorator that extracts the validated JWT user from request.user.
 *
 * Usage (inside a @UseGuards(JwtAuthGuard) controller method):
 *   getMe(@CurrentUser() user: AuthenticatedUser) { ... }
 *
 * The id comes ONLY from the verified JWT — never from body/query params.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
