import { Controller, Delete, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Inject } from '@nestjs/common';
import { STORAGE, type Storage } from '../store/types';
import { Public, SpecialistOnly } from './auth.guard';
import { AuthService } from './auth.service';
import { presetSvg, PRESETS } from './avatars';

/**
 * Картинки аватарок (ТЗ v4.18). Без входа: `<img>` не передаёт токен, а аватарку и так видят все
 * сотрудники. Адрес содержит метку версии (`?v=`), поэтому кэш — надолго.
 */
@Controller('avatars')
export class AvatarsController {
  constructor(
    @Inject(STORAGE) private readonly storage: Storage,
    private readonly auth: AuthService,
  ) {}

  /** Список готовых рисунков для выбора. */
  @Public()
  @Get('presets')
  presets() {
    return Object.entries(PRESETS).map(([id, p]) => ({ id, label: p.label }));
  }

  @Public()
  @Get('preset/:id')
  preset(@Param('id') id: string, @Res() res: Response) {
    const svg = presetSvg(id);
    if (!svg) throw new NotFoundException('Такого рисунка нет');
    this.send(res, 'image/svg+xml', Buffer.from(svg));
  }

  @Public()
  @Get(':userId')
  async image(@Param('userId') userId: string, @Res() res: Response) {
    const u = await this.storage.getUser(userId);
    if (u?.avatar?.startsWith('preset:')) {
      const svg = presetSvg(u.avatar.slice(7));
      if (svg) return this.send(res, 'image/svg+xml', Buffer.from(svg));
    }
    if (u?.avatar?.startsWith('photo:')) {
      const photo = await this.storage.getAvatar(u.id);
      if (photo) return this.send(res, photo.mime, Buffer.from(photo.data, 'base64'));
    }
    throw new NotFoundException('Аватарки нет');
  }

  /** Специалист убирает чужую аватарку, нарушающую правила. */
  @SpecialistOnly()
  @Delete(':userId')
  remove(@Param('userId') userId: string) {
    return this.auth.removeAvatarOf(userId);
  }

  private send(res: Response, type: string, body: Buffer) {
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    // картинка — только картинка: никаких скриптов даже в SVG
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(body);
  }
}
