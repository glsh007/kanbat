import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  type OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { STORAGE, type Storage, type User } from '../store/types';
import { AnswersService } from '../org/answers.service';
import { OrgService } from '../org/org.service';
import { afterClarify, answerHistory, offerText } from '../llm/flow';
import { FlowService } from '../llm/flow.service';
import { LlmService } from '../llm/llm.service';
import type { TriageRoute } from '../llm/types';
import { runWithRequestSignal } from '../llm/watchdog';
import {
  CHECK_LIMITS,
  cleanCheck,
  evaluate,
  EXAMPLES,
  exampleExpect,
  statusOf,
  type CheckItem,
  type CheckQuestion,
  type CheckStatus,
} from './checks';

const QUESTIONS = 'checkQuestions';
const STATE = 'checkState';
/** Один вопрос дольше этого — ошибка «модель не ответила вовремя», прогон идёт дальше. */
const QUESTION_TIMEOUT_MS = 180_000;

export interface CheckResult {
  questionId: string;
  /** Текст вопроса на момент прогона. */
  text: string;
  at: string;
  ms: number;
  model: string | null;
  status: CheckStatus;
  route: TriageRoute | null;
  canned: { id: string; title: string } | null;
  /** Что увидит человек. */
  reply: string;
  questions: { text: string; options: string[] }[];
  urgency: string | null;
  service: string | null;
  rules: { action: string; phrase: string }[];
  /** Вопросы образцов, которые помощник взял для ответа. */
  samples: string[];
  items: CheckItem[];
  error?: string;
  /** Отметка администратора. */
  mark: 'good' | 'bad' | null;
  /** Статус этого вопроса в прошлый раз (для «было — стало»). */
  prev: CheckStatus | null;
}

export interface CheckRunInfo {
  status: 'running' | 'done' | 'stopped' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  by: string;
  model: string | null;
  ids: string[];
  done: number;
  total: number;
  error?: string;
}

interface ChecksState {
  run: CheckRunInfo | null;
  results: Record<string, CheckResult>;
}

/**
 * Проверочные вопросы (ТЗ v4.27): хранение и прогон на настоящей модели. Прогон — в фоне, по одному
 * вопросу (Ollama всё равно отвечает по очереди), тем же путём, что живое обращение. На доску ничего
 * не попадает, специалисту ничего не уходит, статистика готовых ответов не меняется.
 */
@Injectable()
export class ChecksService implements OnModuleInit {
  private readonly log = new Logger('Checks');
  private questions: CheckQuestion[] | null = null;
  private state: ChecksState = { run: null, results: {} };
  private abort: AbortController | null = null;

  constructor(
    @Inject(STORAGE) private readonly storage: Storage,
    private readonly flow: FlowService,
    private readonly llm: LlmService,
    private readonly answers: AnswersService,
    private readonly org: OrgService,
  ) {}

  async onModuleInit() {
    try {
      const raw = JSON.parse((await this.storage.getMeta(STATE)) ?? 'null') as ChecksState | null;
      if (raw && typeof raw === 'object')
        this.state = { run: raw.run ?? null, results: raw.results ?? {} };
    } catch {
      this.state = { run: null, results: {} };
    }
    // сервер перезапустился посреди прогона — честно помечаем
    if (this.state.run?.status === 'running') {
      this.state.run = {
        ...this.state.run,
        status: 'stopped',
        finishedAt: new Date().toISOString(),
        error: 'Сервер перезапускался — прогон прерван',
      };
      await this.persist();
    }
  }

  // ——— Вопросы ———

  async list(): Promise<CheckQuestion[]> {
    if (this.questions) return this.questions;
    try {
      const raw = JSON.parse((await this.storage.getMeta(QUESTIONS)) ?? '[]') as unknown;
      this.questions = Array.isArray(raw) ? (raw as CheckQuestion[]) : [];
    } catch {
      console.warn('Проверочные вопросы повреждены — список пуст');
      this.questions = [];
    }
    return this.questions;
  }

  private async saveList(list: CheckQuestion[]) {
    this.questions = list;
    await this.storage.setMeta(QUESTIONS, JSON.stringify(list));
  }

  async create(raw: unknown, by: User): Promise<CheckQuestion> {
    const list = await this.list();
    if (list.length >= CHECK_LIMITS.questions)
      throw new BadRequestException(`Проверочных вопросов — не больше ${CHECK_LIMITS.questions}`);
    const q: CheckQuestion = {
      id: randomUUID(),
      ...cleanCheck(raw),
      updatedAt: new Date().toISOString(),
      updatedBy: by.name,
    };
    await this.saveList([...list, q]);
    return q;
  }

  async update(id: string, raw: unknown, by: User): Promise<CheckQuestion> {
    const list = await this.list();
    const prev = list.find((q) => q.id === id);
    if (!prev) throw new NotFoundException('Проверочный вопрос не найден');
    const next: CheckQuestion = {
      ...prev,
      ...cleanCheck(raw),
      updatedAt: new Date().toISOString(),
      updatedBy: by.name,
    };
    await this.saveList(list.map((q) => (q.id === id ? next : q)));
    return next;
  }

  async remove(id: string) {
    const list = await this.list();
    if (!list.some((q) => q.id === id)) throw new NotFoundException('Проверочный вопрос не найден');
    await this.saveList(list.filter((q) => q.id !== id));
    const { [id]: _gone, ...rest } = this.state.results;
    void _gone;
    this.state.results = rest;
    await this.persist();
    return { ok: true };
  }

  /** 5 примеров под шаблон отрасли из профиля; уже добавленные (тот же текст) пропускаем. */
  async addExamples(by: User): Promise<CheckQuestion[]> {
    const list = await this.list();
    const template = this.org.get()?.template ?? 'custom';
    const have = new Set(list.map((q) => q.text.toLowerCase()));
    const fresh = EXAMPLES[template]
      .filter((e) => !have.has(e.text.toLowerCase()))
      .slice(0, Math.max(0, CHECK_LIMITS.questions - list.length))
      .map((e): CheckQuestion => ({
        id: randomUUID(),
        text: e.text,
        expect: exampleExpect(e.expect),
        updatedAt: new Date().toISOString(),
        updatedBy: by.name,
      }));
    await this.saveList([...list, ...fresh]);
    return fresh;
  }

  // ——— Прогон ———

  view() {
    return this.state;
  }

  private async persist() {
    await this.storage.setMeta(STATE, JSON.stringify(this.state));
  }

  /** Начать прогон: все вопросы или выбранные. Один прогон одновременно. */
  async start(ids: string[] | null, by: User, requested?: string | null): Promise<CheckRunInfo> {
    if (this.state.run?.status === 'running')
      throw new ConflictException('Прогон уже идёт — дождитесь конца или остановите его');
    const list = await this.list();
    const chosen = ids ? list.filter((q) => ids.includes(q.id)) : list;
    if (!chosen.length) throw new BadRequestException('Добавьте хотя бы один проверочный вопрос');
    const model = await this.llm.modelFor(requested).catch(() => null);
    // прогон проверяет настоящую модель: без неё он бессмыслен
    if (!model)
      throw new ServiceUnavailableException(
        'ИИ сейчас недоступен — прогон проверяет настоящую модель',
      );
    this.state.run = {
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      by: by.name,
      model,
      ids: chosen.map((q) => q.id),
      done: 0,
      total: chosen.length,
    };
    await this.persist();
    this.abort = new AbortController();
    void this.loop(model, this.abort.signal);
    return this.state.run;
  }

  async stop(): Promise<CheckRunInfo | null> {
    if (this.state.run?.status !== 'running') return this.state.run;
    this.abort?.abort();
    this.state.run = { ...this.state.run, status: 'stopped', finishedAt: new Date().toISOString() };
    await this.persist();
    return this.state.run;
  }

  async mark(id: string, mark: unknown) {
    const r = this.state.results[id];
    if (!r) throw new NotFoundException('У этого вопроса ещё нет результата');
    r.mark = mark === 'good' || mark === 'bad' ? mark : null;
    await this.persist();
    return r;
  }

  private async loop(model: string, signal: AbortSignal) {
    const run = this.state.run!;
    try {
      for (const id of run.ids) {
        if (signal.aborted) return;
        const q = (await this.list()).find((x) => x.id === id);
        if (q) {
          // запросы к модели внутри вопроса слушают этот сигнал: «Остановить» прерывает их сразу
          const qSignal = AbortSignal.any([signal, AbortSignal.timeout(QUESTION_TIMEOUT_MS)]);
          const result = await runWithRequestSignal(qSignal, () => this.runOne(q, model, qSignal));
          if (signal.aborted) return;
          const prev = this.state.results[id]?.status ?? null;
          this.state.results[id] = { ...result, prev };
        }
        if (this.state.run === run) run.done += 1;
        await this.persist();
      }
      if (this.state.run === run && run.status === 'running') {
        run.status = 'done';
        run.finishedAt = new Date().toISOString();
        await this.persist();
      }
    } catch (e) {
      this.log.warn(`прогон прерван: ${(e as Error).message}`);
      if (this.state.run === run) {
        run.status = 'failed';
        run.finishedAt = new Date().toISOString();
        run.error = (e as Error).message;
        await this.persist();
      }
    }
  }

  /** Один вопрос — тем же путём, что и живое обращение (разбор → правила → готовый ответ → вопросы / ответ). */
  async runOne(q: CheckQuestion, model: string, signal: AbortSignal): Promise<CheckResult> {
    const t0 = Date.now();
    const base: Omit<CheckResult, 'status' | 'items' | 'ms'> = {
      questionId: q.id,
      text: q.text,
      at: new Date().toISOString(),
      model,
      route: null,
      canned: null,
      reply: '',
      questions: [],
      urgency: null,
      service: null,
      rules: [],
      samples: [],
      mark: null,
      prev: null,
    };
    try {
      const tr = await this.flow.triage(q.text, [], model, { count: false });
      let route: TriageRoute = tr.route ?? 'answer';
      let reply = '';
      let questions: CheckResult['questions'] = [];
      let samples: string[] = [];
      if (route === 'describe') reply = tr.reply;
      if (route === 'canned' && tr.canned) reply = tr.canned.body;
      if (route === 'clarify') {
        const r = await this.flow.supportQuestions(
          answerHistory(q.text, tr).slice(0, 2),
          tr.missing,
          tr.urgency === 'critical',
          model,
        );
        if (r.questions.length) {
          questions = r.questions;
          reply = [r.intro, ...r.questions.map((x, i) => `${i + 1}. ${x.text}`)].join('\n');
        } else route = afterClarify(tr);
      }
      if (route === 'specialist') reply = tr.offer || offerText(tr);
      if (route === 'answer') {
        const a = await this.flow.answer(answerHistory(q.text, tr), model, signal);
        reply = a.text;
        samples = a.samples.map((s) => s.question);
      }
      const canned = tr.canned ? { id: tr.canned.id, title: tr.canned.title } : null;
      const titles = new Map((await this.answers.list()).map((a) => [a.id, a.title]));
      const items = evaluate(
        q.expect,
        {
          route,
          canned: route === 'canned' ? canned : null,
          reply,
          urgency: tr.urgency,
          service: tr.service,
        },
        (id) => titles.get(id) ?? null,
      );
      return {
        ...base,
        route,
        canned: route === 'canned' ? canned : null,
        reply,
        questions,
        urgency: tr.meaningful === false ? null : tr.urgency,
        service: tr.meaningful === false ? null : tr.service,
        rules: tr.rules ?? [],
        samples,
        items,
        status: statusOf(items),
        ms: Date.now() - t0,
      };
    } catch (e) {
      const msg = (e as Error).message || String(e);
      return {
        ...base,
        items: [],
        status: 'error',
        error: /abort|timeout/i.test(msg)
          ? 'Модель не ответила вовремя'
          : /fetch failed|ECONNREFUSED|недоступен/i.test(msg)
            ? 'ИИ сейчас недоступен'
            : msg.slice(0, 300),
        ms: Date.now() - t0,
      };
    }
  }
}
