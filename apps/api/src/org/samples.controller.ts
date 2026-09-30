import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { AdminOnly, CurrentUser } from '../auth/auth.guard';
import type { User } from '../store/types';
import { forbiddenIn } from './rules';
import { RulesService } from './rules.service';
import { SAMPLE_LIMITS } from './samples';
import { SamplesService } from './samples.service';

/** Образцы ответов (ТЗ v4.27): видит и меняет только администратор. */
@Controller('samples')
export class SamplesController {
  constructor(
    private readonly samples: SamplesService,
    private readonly rules: RulesService,
  ) {}

  /** Список; у каждого образца — запрещённые фразы из жёстких правил, если они в нём есть. */
  @AdminOnly()
  @Get()
  async list() {
    const forbidden = await this.rules.forbidden();
    return {
      samples: (await this.samples.list()).map((s) => ({
        ...s,
        conflicts: forbiddenIn(s.answer, forbidden),
      })),
      limits: SAMPLE_LIMITS,
    };
  }

  @AdminOnly()
  @Post()
  create(@CurrentUser() user: User, @Body() body: unknown) {
    return this.samples.create(body, user);
  }

  @AdminOnly()
  @Put(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() body: unknown) {
    return this.samples.update(id, body, user);
  }

  @AdminOnly()
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.samples.remove(id);
  }

  /** Какие образцы помощник возьмёт для этого вопроса (без ИИ). */
  @AdminOnly()
  @Post('pick')
  @HttpCode(200)
  async pick(@Body() body: { text?: unknown }) {
    const text = typeof body?.text === 'string' ? body.text.slice(0, 2000) : '';
    return {
      samples: (await this.samples.pick(text)).map((s) => ({ id: s.id, question: s.question })),
    };
  }
}
