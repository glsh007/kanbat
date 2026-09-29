import { Body, Controller, Delete, Get, HttpCode, Ip, Post, Query } from '@nestjs/common';
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

  /** Регистрация (ТЗ v4.17): имя, ник, пароль, роль (специалисту — код). */
  @Public()
  @Post('register')
  @HttpCode(200)
  register(
    @Body()
    body: {
      name?: unknown;
      username?: unknown;
      password?: unknown;
      role?: unknown;
      code?: unknown;
    },
    @Ip() ip: string,
  ) {
    return this.auth.register(body ?? {}, ip);
  }

  /** Свободен ли ник — экран регистрации проверяет на лету. */
  @Public()
  @Get('username')
  username(@Query('u') u?: string) {
    return this.auth.usernameStatus(u);
  }

  /** Ник для кабинета, созданного до регистрации. */
  @Post('username')
  @HttpCode(200)
  async setUsername(@CurrentUser() user: User, @Body() body: { username?: unknown }) {
    return { user: await this.auth.setUsername(user, body?.username) };
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

  /** Личные настройки: цветовая схема (ТЗ v4.11), автоудаление после года без входа (v4.18). */
  @Post('prefs')
  @HttpCode(200)
  async prefs(
    @CurrentUser() user: User,
    @Body() body: { scheme?: unknown; autoDelete?: unknown; dmOff?: unknown },
  ) {
    return { user: await this.auth.setPrefs(user, body ?? {}) };
  }

  /** Аватарка (ТЗ v4.18): готовый рисунок, своё фото или убрать. */
  @Post('avatar')
  @HttpCode(200)
  async avatar(
    @CurrentUser() user: User,
    @Body() body: { preset?: unknown; photo?: unknown; remove?: unknown },
  ) {
    return { user: await this.auth.setAvatar(user, body ?? {}) };
  }

  /** Новая фраза для восстановления доступа (нужен текущий пароль). */
  @Post('recovery')
  @HttpCode(200)
  recovery(@CurrentUser() user: User, @Body() body: { password?: unknown }) {
    return this.auth.newRecovery(user, body?.password);
  }

  /** «Забыли пароль?»: ник + фраза из 6 слов → новый пароль. */
  @Public()
  @Post('recover')
  @HttpCode(200)
  recover(
    @Body() body: { username?: unknown; phrase?: unknown; password?: unknown },
    @Ip() ip: string,
  ) {
    return this.auth.recover(body ?? {}, ip);
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
