import { Body, Controller, Delete, Get, HttpCode, Ip, Post } from '@nestjs/common';
import type { User } from '../store/types';
import { CurrentToken, CurrentUser, Public } from './auth.guard';
import { AuthService, publicUser } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(
    @Body() body: { name?: unknown; role?: unknown; code?: unknown; password?: unknown },
    @Ip() ip: string,
  ) {
    return this.auth.login(body?.name, body?.role, body?.code, body?.password, ip);
  }

  /** Есть ли такой кабинет — чтобы экран входа попросил придумать или ввести пароль. */
  @Public()
  @Post('check')
  @HttpCode(200)
  check(@Body() body: { name?: unknown; role?: unknown }) {
    return this.auth.check(body?.name, body?.role);
  }

  @Get('me')
  me(@CurrentUser() user: User) {
    return { user: publicUser(user) };
  }

  /** Личные настройки: цветовая схема (ТЗ v4.11). */
  @Post('prefs')
  @HttpCode(200)
  async prefs(@CurrentUser() user: User, @Body() body: { scheme?: unknown }) {
    return { user: await this.auth.setPrefs(user, body ?? {}) };
  }

  @Post('password')
  @HttpCode(204)
  async password(
    @CurrentUser() user: User,
    @CurrentToken() token: string,
    @Body() body: { current?: unknown; next?: unknown },
  ) {
    await this.auth.changePassword(user, token, body?.current, body?.next);
  }

  @Delete('me')
  @HttpCode(204)
  async deleteMe(@CurrentUser() user: User) {
    await this.auth.deleteAccount(user);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentToken() token: string) {
    await this.auth.logout(token);
  }
}
