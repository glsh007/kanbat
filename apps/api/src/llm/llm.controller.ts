import { AdminOnly, Public } from '../auth/auth.guard';
import { cleanProfile } from '../org/profile';
import {
  BadRequestException,
  Body,
  Inject,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Post,
  Query,
  Req,
  Res,
  UseInterceptors,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { Request, Response } from 'express';
import { LlmService } from './llm.service';
import { suggestByWords } from '../forum/suggest';
import { junkReason } from '../forum/text';
import { STORAGE, type Storage } from '../store/types';
import { StreamCleaner } from './stream-cleaner';
import { requestSignal, runWithRequestSignal } from './watchdog';
import type { ChatMessage, StreamMode } from './types';

type WithModel = { model?: string | null };

function messages(v: unknown): ChatMessage[] {
  if (!Array.isArray(v)) throw new BadRequestException('messages должен быть массивом');
  return v
    .filter(
      (m): m is ChatMessage =>
        !!m && typeof m === 'object' && typeof (m as ChatMessage).content === 'string',
    )
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
}

function errorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/fetch failed|ECONNREFUSED/i.test(msg)) return 'ИИ сейчас недоступен: модель не отвечает.';
  if (/not found/i.test(msg)) return `Модель не найдена в Ollama: ${msg}`;
  if (/aborted|timeout/i.test(msg)) return 'Модель не ответила вовремя.';
  return msg;
}

/**
 * Браузер закрыл запрос (новое сообщение, «Стоп», закрыл вкладку) — отменяем и запрос к модели,
 * чтобы брошенная работа не держала очередь Ollama.
 */
class AbortOnCloseInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = ctx.switchToHttp().getResponse<Response>();
    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) abort.abort();
    });
    return new Observable((sub) => {
      const inner = runWithRequestSignal(abort.signal, () => next.handle().subscribe(sub));
      return () => inner.unsubscribe();
    });
  }
}

@Controller('llm')
@UseInterceptors(AbortOnCloseInterceptor)
export class LlmController {
  constructor(
    private readonly llm: LlmService,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  /** Активные сообщества Бат-Форума (стартовые создаёт ForumService при запуске). */
  private async communities() {
    return (await this.storage.listCommunities()).filter((c) => c.status === 'active');
  }

  @Public()
  @Get('status')
  status(@Query('refresh') refresh?: string) {
    return this.llm.status(refresh === '1');
  }

  /** Проверка скорости: короткий ответ модели, время и где она работает. */
  @Post('check')
  check(@Body() body: WithModel) {
    return this.llm.check(body?.model);
  }

  /** Профиль организации: пробный ответ по черновику профиля (ТЗ v4.12). */
  @AdminOnly()
  @Post('org-preview')
  @HttpCode(200)
  async orgPreview(@Body() body: { profile?: unknown; question?: unknown } & WithModel) {
    const profile = cleanProfile(body?.profile);
    const question = typeof body?.question === 'string' ? body.question.trim() : '';
    if (!question) throw new BadRequestException('Напишите вопрос для проверки');
    if (question.length > 1000) throw new BadRequestException('Вопрос — не длиннее 1000 символов');
    try {
      return await this.llm.preview(
        profile,
        question,
        body?.model,
        requestSignal() ?? AbortSignal.timeout(180_000),
      );
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new BadRequestException(errorMessage(e));
    }
  }

  @Post('classify')
  async classify(@Body() body: { text?: string } & WithModel) {
    if (!body?.text?.trim()) throw new BadRequestException('Пустой текст задачи');
    try {
      return await this.llm.classify(body.text, body.model);
    } catch (e) {
      throw new BadRequestException(errorMessage(e));
    }
  }

  @Post('questions')
  async questions(@Body() body: { messages?: unknown; hard?: boolean } & WithModel) {
    try {
      return await this.llm.questions(messages(body?.messages), !!body?.hard, body?.model);
    } catch (e) {
      throw new BadRequestException(errorMessage(e));
    }
  }

  @Post('plan')
  async plan(@Body() body: { messages?: unknown; feedback?: string } & WithModel) {
    try {
      return await this.llm.plan(
        messages(body?.messages),
        body?.feedback?.trim() || undefined,
        body?.model,
      );
    } catch (e) {
      throw new BadRequestException(errorMessage(e));
    }
  }

  // ——— Режим поддержки ———

  @Post('triage')
  async triage(@Body() body: { text?: string; messages?: unknown } & WithModel) {
    if (!body?.text?.trim()) throw new BadRequestException('Пустое обращение');
    try {
      // messages — переписка (необязательно): чтобы ответ на «F» или «привет» звучал по контексту
      const history = body.messages === undefined ? [] : messages(body.messages);
      return await this.llm.triage(body.text, body.model, history);
    } catch (e) {
      throw new BadRequestException(errorMessage(e));
    }
  }

  /** Разложить задачи по разделам по смыслу (ТЗ v3.3, п. 5). */
  @Post('sort')
  async sort(@Body() body: { sections?: unknown; items?: unknown } & WithModel) {
    const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
    const sections = (Array.isArray(body?.sections) ? body.sections : [])
      .map((x: { id?: unknown; name?: unknown; description?: unknown }) => ({
        id: str(x?.id, 80),
        name: str(x?.name, 80),
        description: str(x?.description, 400),
      }))
      .filter((x) => x.id && x.name)
      .slice(0, 30);
    const items = (Array.isArray(body?.items) ? body.items : [])
      .map((x: { id?: unknown; text?: unknown }) => ({
        id: str(x?.id, 80),
        text: str(x?.text, 600),
      }))
      .filter((x) => x.id && x.text)
      .slice(0, 200);
    try {
      return await this.llm.sort(sections, items, body?.model);
    } catch (e) {
      throw new BadRequestException(errorMessage(e));
    }
  }

  /**
   * Подсказка сообщества для новой темы (ТЗ v4.7): ИИ, а если он недоступен или ошибся —
   * совпадение слов с сообществами и их темами. Ничего не блокирует, только советует.
   */
  @Post('forum-suggest')
  async forumSuggest(@Body() body: { title?: unknown; body?: unknown } & WithModel) {
    const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 150) : '';
    const text = typeof body?.body === 'string' ? body.body.trim().slice(0, 1000) : '';
    const list = await this.communities();
    const full = `${title}\n${text}`.trim();
    if (!title) return { sectionId: null, looksLikeQuestion: true, source: 'words' as const };
    try {
      const r = await this.llm.forumSuggest(
        full,
        list.map((c) => ({ id: c.id, name: c.name, description: c.description })),
        body?.model,
      );
      return { sectionId: r.sectionId, looksLikeQuestion: r.isQuestion, source: 'ai' as const };
    } catch {
      return {
        sectionId: suggestByWords(full, list, await this.storage.listThreads()),
        looksLikeQuestion: junkReason(title, 'title') === null,
        source: 'words' as const,
      };
    }
  }

  @Post('support-questions')
  async supportQuestions(
    @Body() body: { messages?: unknown; focus?: unknown; urgent?: boolean } & WithModel,
  ) {
    const focus = Array.isArray(body?.focus) ? body.focus.map(String).slice(0, 3) : [];
    try {
      return await this.llm.supportQuestions(
        messages(body?.messages),
        focus,
        !!body?.urgent,
        body?.model,
      );
    } catch (e) {
      throw new BadRequestException(errorMessage(e));
    }
  }

  @Post('steps')
  async steps(
    @Body() body: { messages?: unknown; urgent?: boolean; attempt?: number } & WithModel,
  ) {
    const attempt = Math.max(1, Math.min(5, Number(body?.attempt) || 1));
    try {
      return await this.llm.steps(messages(body?.messages), !!body?.urgent, attempt, body?.model);
    } catch (e) {
      throw new BadRequestException(errorMessage(e));
    }
  }

  /** Ответ человека на шаг своими словами (ТЗ v4.21). */
  @Post('step-reply')
  @HttpCode(200)
  async stepReply(
    @Body()
    body: { messages?: unknown; plan?: unknown; index?: unknown; urgent?: boolean } & WithModel,
  ) {
    const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
    const plan = (Array.isArray(body?.plan) ? body.plan : [])
      .slice(0, 12)
      .map((x: Record<string, unknown>) => ({
        title: str(x?.title, 120),
        instruction: str(x?.instruction, 400),
        check: str(x?.check, 160),
        result: x?.result === 'ok' || x?.result === 'fail' ? x.result : undefined,
      }))
      .filter((x) => x.title);
    if (!plan.length) throw new BadRequestException('Нет плана');
    const index = Math.max(0, Math.min(plan.length - 1, Number(body?.index) || 0));
    try {
      return await this.llm.stepReply(
        messages(body?.messages),
        plan,
        index,
        !!body?.urgent,
        body?.model,
      );
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new BadRequestException(errorMessage(e));
    }
  }

  @Post('handoff')
  async handoff(@Body() body: { messages?: unknown } & WithModel) {
    try {
      return await this.llm.handoff(messages(body?.messages), body?.model);
    } catch (e) {
      throw new BadRequestException(errorMessage(e));
    }
  }

  /**
   * Стриминг ответа (SSE поверх POST: нужен body с историей).
   * События: meta {model} → token {t} … step {n} … → outcome {state, question, buttons}
   * (если запрошено assess) → done {text} | error {message}.
   */
  @Post('stream')
  async stream(
    @Body()
    body: { messages?: unknown; mode?: StreamMode; plan?: unknown; assess?: unknown } & WithModel,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const history = messages(body?.messages);
    const mode: StreamMode = body?.mode === 'execute' ? 'execute' : 'answer';
    const plan = Array.isArray(body?.plan) ? body.plan.map(String) : [];

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (event: string, data: unknown) =>
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const abort = new AbortController();
    // клиент нажал «Стоп» или закрыл вкладку — прекращаем генерацию в Ollama
    res.on('close', () => abort.abort());
    void req;

    // «пульс» раз в 10 с, пока модель думает: туннели и прокси не закрывают «молчащее» соединение
    const ping = setInterval(() => res.write(': ping\n\n'), 10_000);
    const cleaner = new StreamCleaner();
    try {
      const { model, chunks } = await this.llm.stream(
        history,
        mode,
        plan,
        body?.model,
        abort.signal,
      );
      send('meta', { model });
      for await (const chunk of chunks) {
        const { delta, reset, steps } = cleaner.push(chunk);
        for (const n of steps) send('step', { n });
        if (reset !== null) send('reset', { text: reset });
        if (delta) send('token', { t: delta });
      }
      const tail = cleaner.end();
      for (const n of tail.steps) send('step', { n });
      if (tail.reset !== null) send('reset', { text: tail.reset });
      if (tail.delta) send('token', { t: tail.delta });
      // чем закончился ответ — этап и кнопки по смыслу (ТЗ v4.13); для реплик «спасибо» не нужно
      if (body?.assess === true && !abort.signal.aborted)
        send('outcome', await this.llm.assess(history, cleaner.text, body?.model));
      send('done', { text: cleaner.text });
    } catch (e) {
      if (!abort.signal.aborted) send('error', { message: errorMessage(e) });
    } finally {
      clearInterval(ping);
      res.end();
    }
  }
}
