import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { AdminOnly, CurrentUser, SpecialistOnly } from '../auth/auth.guard';
import type { User } from '../store/types';
import { SupportService } from './support.service';

@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  /** Сотрудник: передать обращение / обновить переписку и статус. */
  @Post('tickets')
  @HttpCode(200)
  push(
    @CurrentUser() user: User,
    @Body()
    body: {
      taskId?: unknown;
      title?: unknown;
      escalation?: unknown;
      messages?: unknown;
      urgent?: unknown;
    },
  ) {
    return this.support.push(user, body);
  }

  /** Сотрудник: мои обращения — чтобы получить ответы и статусы от специалиста. */
  @Get('mine')
  mine(@CurrentUser() user: User) {
    return this.support.mine(user);
  }

  // ——— специалист ———

  @SpecialistOnly()
  @Get('tickets')
  all() {
    return this.support.all();
  }

  @SpecialistOnly()
  @Post('tickets/:id/take')
  @HttpCode(200)
  take(@CurrentUser() user: User, @Param('id') id: string) {
    return this.support.take(user, id);
  }

  @SpecialistOnly()
  @Post('tickets/:id/reply')
  @HttpCode(200)
  reply(@CurrentUser() user: User, @Param('id') id: string, @Body() body: { text?: unknown }) {
    return this.support.reply(user, id, body?.text);
  }

  /** «Вернуть в общую очередь» (ТЗ v4.22). */
  @SpecialistOnly()
  @Post('tickets/:id/release')
  @HttpCode(200)
  release(@CurrentUser() user: User, @Param('id') id: string) {
    return this.support.release(user, id);
  }

  /** «Закрыть без решения» с причиной (ТЗ v4.22). «Отметить решённым» больше нет. */
  @SpecialistOnly()
  @Post('tickets/:id/close')
  @HttpCode(200)
  close(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { reason?: unknown; note?: unknown },
  ) {
    return this.support.close(user, id, body ?? {});
  }

  /** Администратор: передать заявку специалисту (пусто — в общую очередь). */
  @AdminOnly()
  @Post('tickets/:id/assign')
  @HttpCode(200)
  assign(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { specialistId?: unknown },
  ) {
    return this.support.assign(user, id, body?.specialistId);
  }

  @AdminOnly()
  @Get('specialists')
  specialists() {
    return this.support.specialists();
  }

  /** Сроки заявок: видят специалисты, меняет администратор (ТЗ v4.22). */
  @SpecialistOnly()
  @Get('settings')
  settings() {
    return this.support.settings();
  }

  @AdminOnly()
  @Put('settings')
  saveSettings(@Body() body: { closeHours?: unknown; returnHours?: unknown }) {
    return this.support.saveSettings(body ?? {});
  }
}
