import { BadRequestException, Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { AdminOnly, CurrentUser } from '../auth/auth.guard';
import type { User } from '../store/types';
import { censor, cleanRules, fired, RULE_LIMITS } from './rules';
import { RulesService } from './rules.service';

/** Жёсткие правила организации (ТЗ v4.26): видит и меняет только администратор. */
@Controller('rules')
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  @AdminOnly()
  @Get()
  async get() {
    return { ...(await this.rules.get()), limits: RULE_LIMITS };
  }

  @AdminOnly()
  @Put()
  save(@CurrentUser() user: User, @Body() body: unknown) {
    return this.rules.save(body, user);
  }

  /**
   * «Проверить на фразе» — без ИИ: какие правила сработают на это обращение и что было бы убрано,
   * если бы такой текст написал ИИ. Проверяет черновик (ещё не сохранённые правила), если он передан.
   */
  @AdminOnly()
  @Post('test')
  @HttpCode(200)
  async test(@Body() body: { text?: unknown; draft?: unknown }) {
    const text = typeof body?.text === 'string' ? body.text.trim().slice(0, 2000) : '';
    if (!text) throw new BadRequestException('Напишите фразу для проверки');
    const cfg = body?.draft ? cleanRules(body.draft) : await this.rules.get();
    const cleaned = censor(text, cfg.forbidden);
    return {
      fired: fired(text, cfg.rules),
      censored: cleaned !== text,
      cleaned,
    };
  }
}
