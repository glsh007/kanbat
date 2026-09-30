import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Put,
  Res,
  type OnModuleInit,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminOnly, CurrentUser, Public } from '../auth/auth.guard';
import { STORAGE, type Storage, type User } from '../store/types';
import { BRAND_LIMITS, EMPTY_BRAND, mergeBrand, viewOf, type OrgBrand } from './brand';
import { OrgService } from './org.service';

const KEY = 'orgBrand';

/** Оформление организации (ТЗ v4.28): смотреть — всем (и экрану входа), менять — администратору. */
@Controller('brand')
export class BrandController implements OnModuleInit {
  private brand: OrgBrand = EMPTY_BRAND;

  constructor(
    @Inject(STORAGE) private readonly storage: Storage,
    private readonly org: OrgService,
  ) {}

  async onModuleInit() {
    try {
      const raw = JSON.parse((await this.storage.getMeta(KEY)) ?? 'null') as OrgBrand | null;
      if (raw && typeof raw === 'object') this.brand = { ...EMPTY_BRAND, ...raw };
    } catch {
      console.warn('Оформление организации повреждено — стандартный Канбат');
    }
  }

  @Public()
  @Get()
  get() {
    return { ...viewOf(this.brand), orgName: this.org.get()?.orgName ?? '', limits: BRAND_LIMITS };
  }

  @AdminOnly()
  @Put()
  async save(@CurrentUser() user: User, @Body() body: unknown) {
    this.brand = {
      ...mergeBrand(this.brand, body),
      updatedAt: new Date().toISOString(),
      updatedBy: user.name,
    };
    await this.storage.setMeta(KEY, JSON.stringify(this.brand));
    return { ...viewOf(this.brand), orgName: this.org.get()?.orgName ?? '', limits: BRAND_LIMITS };
  }

  @Public()
  @Get('logo')
  logo(@Res() res: Response) {
    return this.send(res, 'logo');
  }

  @Public()
  @Get('mark')
  mark(@Res() res: Response) {
    return this.send(res, 'mark');
  }

  private send(res: Response, key: 'logo' | 'mark') {
    const img = this.brand[key];
    if (!img) throw new NotFoundException('Не настроено');
    res.setHeader('Content-Type', img.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // SVG, открытый напрямую, не может выполнить ничего своего
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(Buffer.from(img.data, 'base64'));
  }
}
