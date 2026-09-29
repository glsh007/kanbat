import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AvatarsController } from './avatars.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

/** Вход обязателен для всего API, кроме помеченного @Public(). */
@Global()
@Module({
  controllers: [AuthController, AvatarsController],
  providers: [AuthService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthService],
})
export class AuthModule {}
