import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { AdminOnly, CurrentUser } from '../auth/auth.guard';
import { LlmService } from '../llm/llm.service';
import type { User } from '../store/types';
import { CHECK_LIMITS, ROUTE_LABELS } from './checks';
import { ChecksService } from './checks.service';

/** Проверочные вопросы и прогон на настоящей модели (ТЗ v4.27): только администратор. */
@Controller('checks')
export class ChecksController {
  constructor(
    private readonly checks: ChecksService,
    private readonly llm: LlmService,
  ) {}

  /** Вопросы, прогон и результаты; provider — чтобы предупредить о расходе токенов в облаке. */
  @AdminOnly()
  @Get()
  async get() {
    const status = await this.llm.status().catch(() => null);
    return {
      questions: await this.checks.list(),
      ...this.checks.view(),
      limits: CHECK_LIMITS,
      routes: ROUTE_LABELS,
      provider: status?.provider ?? 'mock',
    };
  }

  @AdminOnly()
  @Post()
  create(@CurrentUser() user: User, @Body() body: unknown) {
    return this.checks.create(body, user);
  }

  @AdminOnly()
  @Post('examples')
  @HttpCode(200)
  async examples(@CurrentUser() user: User) {
    return { added: await this.checks.addExamples(user) };
  }

  @AdminOnly()
  @Post('run')
  @HttpCode(200)
  run(@CurrentUser() user: User, @Body() body: { ids?: unknown; model?: string | null }) {
    const ids = Array.isArray(body?.ids) ? body.ids.map(String).slice(0, 100) : null;
    return this.checks.start(ids, user, body?.model);
  }

  @AdminOnly()
  @Post('stop')
  @HttpCode(200)
  stop() {
    return this.checks.stop();
  }

  @AdminOnly()
  @Put(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() body: unknown) {
    return this.checks.update(id, body, user);
  }

  @AdminOnly()
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.checks.remove(id);
  }

  /** Отметка администратора «Хорошо / Плохо» у ответа. */
  @AdminOnly()
  @Post(':id/mark')
  @HttpCode(200)
  mark(@Param('id') id: string, @Body() body: { mark?: unknown }) {
    return this.checks.mark(id, body?.mark);
  }
}
