import { Body, Controller, Get, Put } from '@nestjs/common';
import { AdminOnly, CurrentUser, isAdmin } from '../auth/auth.guard';
import type { User } from '../store/types';
import { OrgService } from './org.service';
import { LIMITS, TEMPLATES } from './profile';

/** Профиль организации (ТЗ v4.12): администратор настраивает помощника под организацию. */
@Controller('org')
export class OrgController {
  constructor(private readonly org: OrgService) {}

  /** Всем вошедшим — имя помощника и организации; администратору — весь профиль. */
  @Get()
  get(@CurrentUser() user: User) {
    if (!isAdmin(user)) return { info: this.org.publicInfo() };
    return {
      info: this.org.publicInfo(),
      profile: this.org.get(),
      templates: TEMPLATES,
      limits: LIMITS,
    };
  }

  @AdminOnly()
  @Put()
  async save(@CurrentUser() user: User, @Body() body: { profile?: unknown }) {
    return { profile: await this.org.save(body?.profile, user), info: this.org.publicInfo() };
  }
}
