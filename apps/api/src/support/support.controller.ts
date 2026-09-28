import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { CurrentUser, SpecialistOnly } from '../auth/auth.guard';
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

  @SpecialistOnly()
  @Post('tickets/:id/resolve')
  @HttpCode(200)
  resolve(@Param('id') id: string) {
    return this.support.resolve(id);
  }
}
