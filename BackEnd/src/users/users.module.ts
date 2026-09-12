import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    AuthModule, // provides JwtAuthGuard (exported from AuthModule)
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService], // exportable for other modules that need user lookup
})
export class UsersModule {}
