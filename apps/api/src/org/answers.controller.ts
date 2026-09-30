import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { AdminOnly, CurrentUser } from '../auth/auth.guard';
import type { User } from '../store/types';
import { ANSWER_LIMITS, viewOf } from './answers';
import { AnswersService } from './answers.service';

/** Готовые ответы организации (ТЗ v4.25): меняет администратор, подбор без ИИ и отзывы — все. */
@Controller('answers')
export class AnswersController {
  constructor(private readonly answers: AnswersService) {}

  @AdminOnly()
  @Get()
  async list() {
    return { answers: await this.answers.list(), limits: ANSWER_LIMITS };
  }

  @AdminOnly()
  @Post()
  create(@CurrentUser() user: User, @Body() body: unknown) {
    return this.answers.create(body, user);
  }

  @AdminOnly()
  @Put(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() body: unknown) {
    return this.answers.update(id, body, user);
  }

  @AdminOnly()
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.answers.remove(id);
  }

  /**
   * Без ИИ (модель недоступна): готовый ответ только при сильном совпадении слов — иначе null,
   * и человек выбирает из частых вопросов или зовёт специалиста.
   */
  @Post('match')
  @HttpCode(200)
  async match(@Body() body: { text?: unknown }) {
    const text = typeof body?.text === 'string' ? body.text.slice(0, 2000) : '';
    const a = text ? await this.answers.strong(text) : null;
    if (a) await this.answers.count(a.id, 'shown');
    return { answer: a ? viewOf(a) : null };
  }

  /** «Не помогло» после готового ответа — для статистики администратора. */
  @Post(':id/feedback')
  @HttpCode(200)
  async feedback(@Param('id') id: string, @Body() body: { helped?: unknown }) {
    if (body?.helped === false) await this.answers.count(id, 'notHelped');
    return { ok: true };
  }
}
