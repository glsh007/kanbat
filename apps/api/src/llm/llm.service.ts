import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  mockAnswer,
  mockClassify,
  mockHandoff,
  mockPlan,
  mockQuestions,
  mockSteps,
  mockStepReply,
  isBareAck,
  withoutQuestions,
  mockStream,
  mockSupportQuestions,
  mockTriage,
  isSmalltalk,
  meaningfulLines,
  looksLikeRequest,
  ARITHMETIC,
  dropUnaskedGreeting,
  mockReply,
  mockAssess,
  mockSort,
  unclearTriage,
} from './mock';
import { config, LLM_LIMITS } from '../config';
import { OllamaClient, OllamaError, toOllama } from './ollama.client';
import { OpenAiClient } from './openai.client';
import * as P from './prompts';
import { maskPersonalData } from '../common/pii';
import { OrgService } from '../org/org.service';
import type { OrgProfile } from '../org/profile';
import { StreamCleaner } from './stream-cleaner';
import type {
  ChatMessage,
  ClassifyResult,
  HandoffResult,
  LlmCheck,
  LlmStatus,
  PlanResult,
  QuestionsResult,
  SectionRef,
  SolutionStep,
  SortItem,
  SortResult,
  StepsResult,
  StreamMode,
  Triage,
  AnswerOutcome,
  PlanStepRef,
  StepOutcome,
  StepReplyResult,
} from './types';
import { STEP_OUTCOMES } from './types';

/** Модели по убыванию предпочтения, если пользователь не выбрал свою. */
const PREFERRED = [
  'qwen3:8b',
  'qwen3:14b',
  'qwen2.5:7b',
  'qwen3:4b',
  'qwen2.5:14b',
  'qwen3.5:9b',
  'gemma4:e4b',
  'qwen2.5:3b',
];

/** Сколько последних сообщений отправлять модели (контекст локальной модели невелик). */
const HISTORY_LIMIT = 24;
const MESSAGE_CHAR_LIMIT = 6000;
/** Сколько задач раскладывать по разделам за один запрос к модели. */
const SORT_CHUNK = 8;

@Injectable()
export class LlmService {
  private readonly log = new Logger('LLM');

  constructor(private readonly org: OrgService) {}

  /** Единая базовая инструкция помощника (ТЗ v4.13): роль по умолчанию или профиль организации. */
  private base(): string {
    return this.org.base();
  }
  /** ИИ выбирается переменной LLM_PROVIDER: ollama (по умолчанию), openai или yandex. */
  private readonly remote = config.llmProvider !== 'ollama';
  readonly client: OllamaClient | OpenAiClient = this.remote
    ? new OpenAiClient({
        baseUrl: config.llmBaseUrl,
        apiKey: config.llmApiKey,
        models: config.llmModels,
        yandexFolderId: config.llmProvider === 'yandex' ? config.yandexFolderId : undefined,
      })
    : new OllamaClient(config.ollamaUrl);
  private cache: { at: number; status: LlmStatus } | null = null;

  async status(force = false): Promise<LlmStatus> {
    if (!force && this.cache && Date.now() - this.cache.at < 10_000) return this.cache.status;
    const base: LlmStatus = {
      provider: 'mock',
      url: this.client.baseUrl,
      version: null,
      models: [],
      model: null,
      hint: null,
      demo: config.llmDemo,
    };
    let status: LlmStatus;
    try {
      const signal = AbortSignal.timeout(this.remote ? 8000 : 2500);
      const [version, models] = await Promise.all([
        this.client.version(signal),
        this.client.models(signal),
      ]);
      const model = this.pickModel(models);
      status = model
        ? { ...base, provider: this.remote ? 'openai' : 'ollama', version, models, model }
        : {
            ...base,
            version,
            hint: this.remote
              ? 'Укажите модель в LLM_MODEL'
              : 'Ollama запущена, но моделей нет. Выполните: ollama pull qwen3:8b',
          };
    } catch (e) {
      status = {
        ...base,
        hint: this.remote
          ? `Сервис ИИ ${this.client.baseUrl} недоступен: ${(e as Error).message}`
          : `Ollama не отвечает по адресу ${this.client.baseUrl}. Запустите приложение Ollama.`,
      };
    }
    this.cache = { at: Date.now(), status };
    return status;
  }

  private pickModel(models: string[], requested?: string | null): string | null {
    if (requested && models.includes(requested)) return requested;
    const env = config.llmModel;
    if (env && models.includes(env)) return env;
    return PREFERRED.find((m) => models.includes(m)) ?? models[0] ?? null;
  }

  /** Какую модель использовать для запроса; null — демо-режим. */
  private async resolve(requested?: string | null): Promise<string | null> {
    const s = await this.status();
    if (s.provider === 'mock') return null;
    return this.pickModel(s.models, requested);
  }

  /**
   * Модели нет: в демо-режиме (LLM_DEMO=1) — заготовка, иначе честная ошибка 503.
   * Раскладка по разделам работает и без модели — по совпадению слов (это не выдаётся за ИИ).
   */
  private withoutAi<T>(demo: () => T): T {
    if (config.llmDemo) return demo();
    throw new ServiceUnavailableException('ИИ сейчас недоступен');
  }

  private trim(history: ChatMessage[]): ChatMessage[] {
    return (
      history
        .filter(
          (m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string',
        )
        .slice(-HISTORY_LIMIT)
        // персональные данные ИИ не получает, даже если клиент их не скрыл (ТЗ v4.16)
        .map((m) => ({
          role: m.role,
          content: maskPersonalData(m.content.slice(0, MESSAGE_CHAR_LIMIT)).text,
        }))
    );
  }

  /** Логирует ошибку модели; при 404 (модель удалили) сбрасывает кэш списка моделей. */
  private async guard<T>(label: string, run: () => Promise<T>): Promise<T> {
    this.active += 1;
    try {
      return await run();
    } catch (e) {
      if (e instanceof OllamaError && e.status === 404) this.cache = null;
      this.log.warn(`${label}: ${(e as Error).message}`);
      throw e;
    } finally {
      this.active -= 1;
    }
  }

  async classify(text: string, requested?: string | null): Promise<ClassifyResult> {
    const model = await this.resolve(requested);
    if (!model) return this.withoutAi(() => mockClassify(text));
    const r = await this.guard('classify', () =>
      this.client.json<ClassifyResult>(
        model,
        toOllama(P.CLASSIFY, [{ role: 'user', content: text.slice(0, MESSAGE_CHAR_LIMIT) }]),
        P.CLASSIFY_SCHEMA,
      ),
    );
    return normalizeClassify(r, text);
  }

  async questions(
    history: ChatMessage[],
    hard: boolean,
    requested?: string | null,
  ): Promise<QuestionsResult> {
    const model = await this.resolve(requested);
    if (!model) return this.withoutAi(() => mockQuestions(hard));
    const r = await this.guard('questions', () =>
      this.client.json<QuestionsResult>(
        model,
        toOllama(P.QUESTIONS(this.base(), hard), this.trim(history)),
        P.QUESTIONS_SCHEMA,
      ),
    );
    const questions = (r.questions ?? [])
      .filter((q) => q && typeof q.text === 'string' && q.text.trim())
      .slice(0, 3)
      .map((q) => ({
        text: q.text.trim(),
        options: ensureDefaultOption((q.options ?? []).map(String).filter(Boolean).slice(0, 4)),
      }));
    return {
      intro: r.intro?.trim() || 'Уточню пару моментов.',
      questions: questions.length ? questions : mockQuestions(hard).questions,
    };
  }

  async plan(
    history: ChatMessage[],
    feedback: string | undefined,
    requested?: string | null,
  ): Promise<PlanResult> {
    const model = await this.resolve(requested);
    if (!model) return this.withoutAi(() => mockPlan());
    const r = await this.guard('plan', () =>
      this.client.json<PlanResult>(
        model,
        toOllama(P.PLAN(this.base(), feedback), this.trim(history)),
        P.PLAN_SCHEMA,
      ),
    );
    const steps = (r.steps ?? [])
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, 6);
    return {
      intro: r.intro?.trim() || 'План выполнения:',
      steps: steps.length >= 2 ? steps : mockPlan().steps,
    };
  }

  // ——— Режим поддержки (ТЗ v2, п. 13) ———

  async triage(
    text: string,
    requested?: string | null,
    history: ChatMessage[] = [],
  ): Promise<Triage> {
    text = maskPersonalData(text).text;
    const hist = history.length
      ? this.trim(history)
      : [{ role: 'user' as const, content: text.slice(0, MESSAGE_CHAR_LIMIT) }];
    const model = await this.resolve(requested);
    if (!model) return this.withoutAi(() => mockTriage(text, hist));
    // Только «F», «привет», «как дела?» — разбирать нечего: модель лишь отвечает по-человечески
    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.every(isSmalltalk))
      return unclearTriage(text, await this.smalltalk(model, hist, text));

    const ask = (t: string) =>
      this.guard('triage', () =>
        this.client.json<Partial<Triage>>(
          model,
          toOllama(P.TRIAGE(this.base()), [
            { role: 'user', content: numbered(t).slice(0, MESSAGE_CHAR_LIMIT) },
          ]),
          P.TRIAGE_SCHEMA,
        ),
      );
    let used = text;
    let r = await ask(used);
    if (r.meaningful === false) {
      // Модель могла запутаться в репликах без сути («F», «ничего не случилось») — пробуем только суть
      const rest = meaningfulLines(text).join('\n');
      if (!rest) return unclearTriage(text, await this.smalltalk(model, hist, text));
      if (rest !== text) {
        used = rest;
        r = await ask(used);
      }
      // явный вопрос или просьба («как установить…?», «сколько будет 2 + 3») — это обращение,
      // даже если модель сомневается
      // …но не вопрос к самому помощнику («Кто ты сейчас?», «Как тебя зовут?») — это разговор (v4.15)
      if (
        r.meaningful === false &&
        used.split('\n').some((l) => looksLikeRequest(l) && !isSmalltalk(l))
      )
        r = { meaningful: true }; // поля «непонятного» разбора — случайные: берём разбор по словам
    }
    if (r.meaningful === false) return unclearTriage(text, await this.smalltalk(model, hist, text));
    return needsDetails(askForDetails(normalizeTriage(r, used), used));
  }

  /**
   * Раскладка задач по разделам по смыслу. Модели отдаём номера, а не id — маленьким моделям так проще.
   * Задачи — пачками по SORT_CHUNK; при ошибке пачки — раскладка по совпадению слов.
   */
  async sort(
    sections: SectionRef[],
    items: SortItem[],
    requested?: string | null,
  ): Promise<SortResult> {
    if (!sections.length || !items.length) return { assign: {} };
    const model = await this.resolve(requested);
    if (!model) return mockSort(sections, items);
    const assign: Record<string, string[]> = {};
    for (let i = 0; i < items.length; i += SORT_CHUNK) {
      const chunk = items.slice(i, i + SORT_CHUNK);
      const list = chunk.map((it, n) => `${n + 1}. ${it.text.slice(0, 300)}`).join('\n');
      try {
        const r = await this.guard('sort', () =>
          this.client.json<{ items?: { task?: number; sections?: number[] }[] }>(
            model,
            toOllama(P.SORT(sections), [{ role: 'user', content: `Задачи:\n${list}` }]),
            P.SORT_SCHEMA,
          ),
        );
        for (const it of chunk) assign[it.id] = [];
        for (const row of r.items ?? []) {
          const it = chunk[Number(row.task) - 1];
          if (!it) continue;
          const ids = (Array.isArray(row.sections) ? row.sections : [])
            .map((n) => sections[Number(n) - 1]?.id)
            .filter((x): x is string => !!x);
          assign[it.id] = [...new Set(ids)];
        }
      } catch {
        Object.assign(assign, mockSort(sections, chunk).assign);
      }
    }
    return { assign };
  }

  /** Черновик темы форума из решённого обращения (без личных данных). Без модели — 503. */
  /**
   * Подсказка сообщества для новой темы форума. Без модели — ошибка: вызывающий
   * переходит на подсказку по словам (и честно помечает её как «по словам»).
   */
  async forumSuggest(
    text: string,
    sections: { id: string; name: string; description: string }[],
    requested?: string | null,
  ): Promise<{ sectionId: string | null; isQuestion: boolean }> {
    const model = await this.resolve(requested);
    if (!model) throw new ServiceUnavailableException('ИИ сейчас недоступен');
    const r = await this.guard('forum-suggest', () =>
      this.client.json<{ section?: number; isQuestion?: boolean }>(
        model,
        toOllama(P.FORUM_SUGGEST(sections), [{ role: 'user', content: text.slice(0, 1200) }]),
        P.FORUM_SUGGEST_SCHEMA,
      ),
    );
    const n = Number(r.section);
    return {
      sectionId: Number.isInteger(n) && n >= 1 ? (sections[n - 1]?.id ?? null) : null,
      isQuestion: r.isQuestion !== false,
    };
  }

  /** Живой ответ, когда обращения пока нет. Без модели или при ошибке — заготовка по смыслу реплики. */
  private async smalltalk(model: string, hist: ChatMessage[], text: string): Promise<string> {
    try {
      const r = await this.guard('smalltalk', () =>
        this.client.json<{ reply?: string }>(
          model,
          toOllama(P.SMALLTALK(this.base()), hist),
          P.SMALLTALK_SCHEMA,
        ),
      );
      const reply = typeof r.reply === 'string' ? dropUnaskedGreeting(r.reply.trim(), text) : '';
      return reply && reply.length <= 500 ? reply : mockReply(text, hist);
    } catch {
      return mockReply(text, hist);
    }
  }

  async supportQuestions(
    history: ChatMessage[],
    focus: string[],
    urgent: boolean,
    requested?: string | null,
  ): Promise<QuestionsResult> {
    const model = await this.resolve(requested);
    if (!model) return this.withoutAi(() => mockSupportQuestions(focus, urgent));
    const r = await this.guard('support-questions', () =>
      this.client.json<QuestionsResult>(
        model,
        toOllama(P.SUPPORT_QUESTIONS(this.base(), focus, urgent), this.trim(history)),
        P.SUPPORT_QUESTIONS_SCHEMA,
      ),
    );
    // не больше 2 вопросов (срочно — 1), без повторов; «Не знаю» — только если модель сочла уместным:
    // человек всегда может ответить своими словами или пропустить вопрос (ТЗ v4.14)
    const seen = new Set<string>();
    const questions = (r.questions ?? [])
      .filter((q) => q && typeof q.text === 'string' && q.text.trim())
      .filter((q) => {
        const key = q.text
          .toLowerCase()
          .replace(/[^а-яёa-z0-9]+/g, ' ')
          .trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, urgent ? 1 : 2)
      .map((q) => {
        const opts = [
          ...new Set((q.options ?? []).map((o) => String(o).trim()).filter(Boolean)),
        ].slice(0, 4);
        return { text: q.text.trim(), options: opts };
      });
    return { intro: r.intro?.trim() || 'Уточню главное.', questions };
  }

  async steps(
    history: ChatMessage[],
    urgent: boolean,
    attempt: number,
    requested?: string | null,
  ): Promise<StepsResult> {
    const model = await this.resolve(requested);
    if (!model) return this.withoutAi(() => mockSteps(urgent, attempt));
    const r = await this.guard('steps', () =>
      this.client.json<Partial<StepsResult>>(
        model,
        toOllama(P.STEPS(this.base(), urgent, attempt), this.trim(history)),
        P.STEPS_SCHEMA,
      ),
    );
    const steps = (r.steps ?? [])
      .filter((x) => x && typeof x.title === 'string' && x.title.trim())
      .slice(0, 5)
      .map((x) => normalizeStep(x));
    const selfSolvable = r.self_solvable !== false && steps.length > 0;
    return {
      intro: r.intro?.trim() || 'Пройдём по шагам.',
      steps: selfSolvable ? steps : [],
      self_solvable: selfSolvable,
      escalate_reason:
        (r.escalate_reason ?? '').trim() || (selfSolvable ? '' : 'Самостоятельно не решить.'),
    };
  }

  /**
   * Ответ человека на шаг своими словами (ТЗ v4.21): живая реакция + итог для кода.
   * Без модели — разбор по словам (mockStepReply).
   */
  async stepReply(
    history: ChatMessage[],
    plan: PlanStepRef[],
    index: number,
    urgent: boolean,
    requested?: string | null,
  ): Promise<StepReplyResult> {
    const last = [...history].reverse().find((m) => m.role === 'user')?.content ?? '';
    const model = await this.resolve(requested);
    if (!model) return this.withoutAi(() => mockStepReply(last, plan, index));
    // ошибка модели уходит клиенту: он разберёт ответ по словам сам и не выдумает шагов
    const r = await this.guard('step-reply', () =>
      this.client.json<Partial<StepReplyResult>>(
        model,
        toOllama(P.STEP_REPLY(this.base(), plan, index, urgent), this.trim(history)),
        P.STEP_REPLY_SCHEMA,
      ),
    );
    let outcome = STEP_OUTCOMES.includes(r.outcome as StepOutcome)
      ? (r.outcome as StepOutcome)
      : mockStepReply(last, plan, index).outcome;
    let reply = typeof r.reply === 'string' ? r.reply.trim().slice(0, 600) : '';
    const raw = r.step && typeof r.step === 'object' ? r.step : null;
    const step =
      raw && typeof raw.title === 'string' && raw.title.trim()
        ? (() => {
            const n = normalizeStep(raw as SolutionStep);
            return { title: n.title.slice(0, 80), instruction: n.instruction, check: n.check };
          })()
        : null;
    // модель переспрашивает, хотя человек уже ответил («не приходят», «нет»), — идём дальше по плану:
    // переспрос одного и того же вопроса по кругу злит больше всего (ТЗ v4.23)
    if (outcome === 'ask' && !isBareAck(last)) {
      outcome = 'done';
      reply = withoutQuestions(reply);
    }
    const needsStep = outcome === 'failed' || outcome === 'other';
    // «не помогло» без нового действия: есть следующий шаг плана — идём к нему, нет — честно про специалиста
    if (needsStep && !step && index + 1 < plan.length)
      return { outcome, reply: withoutQuestions(reply), step: null };
    if (needsStep && !step)
      return {
        outcome: 'specialist',
        reply: `${reply ? `${reply} ` : ''}Больше идей, что можно сделать самому, у меня нет. Передать обращение специалисту?`,
        step: null,
      };
    return {
      outcome,
      reply:
        reply ||
        (outcome === 'ask'
          ? 'Что получилось в итоге?'
          : outcome === 'solved'
            ? 'Отлично, рад, что всё заработало!'
            : ''),
      step: needsStep ? step : null,
    };
  }

  async handoff(history: ChatMessage[], requested?: string | null): Promise<HandoffResult> {
    const model = await this.resolve(requested);
    if (!model) return this.withoutAi(() => mockHandoff(history));
    const r = await this.guard('handoff', () =>
      this.client.json<Partial<HandoffResult>>(
        model,
        toOllama(P.HANDOFF, this.trim(history)),
        P.HANDOFF_SCHEMA,
      ),
    );
    return {
      hypothesis: r.hypothesis?.trim() || 'Не удалось определить.',
      actions: (r.actions ?? [])
        .map(String)
        .map((a) => a.trim())
        .filter(Boolean)
        .slice(0, 10),
      result: r.result?.trim() || '',
      notes: r.notes?.trim() || '',
    };
  }

  /** Поток текста ответа + имя модели (null — демо). */
  async stream(
    history: ChatMessage[],
    mode: StreamMode,
    plan: string[],
    requested: string | null | undefined,
    signal: AbortSignal,
  ): Promise<{ model: string | null; chunks: AsyncGenerator<string> }> {
    const model = await this.resolve(requested);
    const trimmed = this.trim(history);
    const sign = this.org.signature();
    if (!model)
      return this.withoutAi(() => ({
        model: null,
        chunks: withSignature(mockStream(mockAnswer(trimmed, mode, plan), signal), sign),
      }));
    const execute = mode === 'execute' && plan.length > 0;
    const system = execute ? P.EXECUTE(this.base(), plan) : P.ANSWER(this.base());
    const limit = execute ? LLM_LIMITS.executeTokens : LLM_LIMITS.answerTokens;
    return {
      model,
      chunks: withSignature(
        this.track(this.client.stream(model, toOllama(system, trimmed), signal, limit)),
        sign,
      ),
    };
  }

  /**
   * «Проверить на вопросе» в профиле организации: ответ по ЧЕРНОВИКУ профиля (ещё не сохранённому),
   * без доски и разбора — чтобы администратор увидел роль, тон и тонкости до сохранения.
   */
  async preview(
    profile: OrgProfile,
    question: string,
    requested: string | null | undefined,
    signal: AbortSignal,
  ): Promise<{ model: string | null; reply: string }> {
    const model = await this.resolve(requested);
    const history: ChatMessage[] = [
      { role: 'user', content: maskPersonalData(question.slice(0, 1000)).text },
    ];
    const sign = this.org.signature(profile);
    if (!model)
      return this.withoutAi(() => ({
        model: null,
        reply: [
          `Демо-режим: ИИ не подключён. ${profile.assistantName} ответит в роли «${profile.role}», когда ИИ заработает.`,
          sign,
        ]
          .filter(Boolean)
          .join('\n\n'),
      }));
    const system = P.ANSWER(this.org.base(profile));
    const cleaner = new StreamCleaner();
    const chunks = this.track(
      this.client.stream(model, toOllama(system, history), signal, LLM_LIMITS.answerTokens),
    );
    for await (const c of withSignature(chunks, sign)) cleaner.push(c);
    cleaner.end();
    return { model, reply: cleaner.text.trim() };
  }

  /**
   * Чем закончился ответ (ТЗ v4.13): нужны данные / часть сделана / готово — и кнопки по смыслу.
   * Короткий отдельный запрос с JSON-схемой; без ИИ или при ошибке — запасная оценка по тексту.
   */
  async assess(
    history: ChatMessage[],
    answer: string,
    requested?: string | null,
  ): Promise<AnswerOutcome> {
    const fallback = mockAssess(answer);
    const model = await this.resolve(requested).catch(() => null);
    if (!model || !answer.trim()) return fallback;
    // служебная реплика «Ответь по существу…» — не слова человека: берём его настоящее сообщение
    const lastUser =
      [...history]
        .reverse()
        .find(
          (m) => m.role === 'user' && !m.content.startsWith('Ответь по существу на моё обращение'),
        )?.content ?? '';
    const content = [
      `Последнее сообщение человека:\n${lastUser.slice(0, 1500)}`,
      `Ответ помощника:\n${answer.slice(0, 4000)}`,
    ].join('\n\n');
    try {
      const r = await this.guard('assess', () =>
        this.client.json<Partial<AnswerOutcome>>(
          model,
          toOllama(P.ASSESS, [{ role: 'user', content }]),
          P.ASSESS_SCHEMA,
        ),
      );
      return normalizeOutcome(r, fallback);
    } catch {
      return fallback;
    }
  }

  /** Сколько запросов к модели выполняется сейчас (Ollama отвечает на них по очереди). */
  private active = 0;

  private async *track(chunks: AsyncGenerator<string>): AsyncGenerator<string> {
    this.active += 1;
    try {
      yield* chunks;
    } finally {
      this.active -= 1;
    }
  }

  /**
   * Проверка скорости ИИ (кнопка в «Настройках»): короткий ответ, время до первого слова и всего,
   * где работает модель (видеокарта / процессор) и сколько запросов сейчас в очереди.
   */
  async check(requested?: string | null): Promise<LlmCheck> {
    const model = await this.resolve(requested);
    if (!model) return { ok: false, model: null, error: 'ИИ сейчас недоступен', busy: this.active };
    const busy = this.active;
    const t0 = Date.now();
    let firstMs: number | null = null;
    try {
      const chunks = this.track(
        this.client.stream(
          model,
          toOllama('Ответь одним словом.', [{ role: 'user', content: 'Скажи «готово».' }]),
          undefined,
          16,
        ),
      );
      for await (const _chunk of chunks) firstMs ??= Date.now() - t0;
      const processor = await this.client.processor(model);
      return { ok: true, model, firstMs, totalMs: Date.now() - t0, processor, busy };
    } catch (e) {
      this.log.warn(`check: ${(e as Error).message}`);
      return { ok: false, model, error: (e as Error).message, busy };
    }
  }
}

function ensureDefaultOption(options: string[]): string[] {
  const has = options.some((o) => /усмотрени/i.test(o));
  const list = options.filter((o) => !/усмотрени/i.test(o)).slice(0, 3);
  return has || list.length ? [...list, 'На твоё усмотрение'] : ['Да', 'Нет', 'На твоё усмотрение'];
}

function normalizeClassify(r: Partial<ClassifyResult>, text: string): ClassifyResult {
  const fallback = mockClassify(text);
  const title = (r.title ?? '').replace(/^["«']|["»'.]$/g, '').trim();
  return {
    structure:
      r.structure === 'loose' ? 'loose' : r.structure === 'clear' ? 'clear' : fallback.structure,
    difficulty:
      r.difficulty === 'hard' ? 'hard' : r.difficulty === 'easy' ? 'easy' : fallback.difficulty,
    reason: r.reason?.trim() || '',
    estimated_seconds: Math.min(
      900,
      Math.max(3, Number(r.estimated_seconds) || fallback.estimated_seconds),
    ),
    title: title ? title.slice(0, 80) : fallback.title,
  };
}

function strList(v: unknown, max: number): string[] {
  return Array.isArray(v)
    ? v
        .map((x) => String(x).trim())
        .filter(Boolean)
        .slice(0, max)
    : [];
}

/** Несколько сообщений пользователя — нумеруем, чтобы модель видела отдельные реплики. */
function numbered(text: string): string {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return text;
  return `Сообщения пользователя по порядку:\n${lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}`;
}

function normalizeTriage(r: Partial<Triage>, text: string): Triage {
  const f = mockTriage(text);
  const oneOf = <T extends string>(v: unknown, list: readonly T[], fb: T): T =>
    list.includes(v as T) ? (v as T) : fb;
  if (r.meaningful === false) return unclearTriage(text);
  const title = (r.title ?? '').replace(/^["«']|["»'.]$/g, '').trim();
  // «уточнить, для кого…» → «для кого…»: в карточке и так написано «Уточню:»
  const tidy = (xs: string[]) =>
    xs.map((x) =>
      x.replace(/^\s*(уточнить|уточню|спросить)[\s,:—-]*/i, '').replace(/[\s.;,]+$/, ''),
    );
  return {
    meaningful: true,
    reply: '',
    summary: r.summary?.trim() || f.summary,
    service: r.service?.trim() || f.service,
    facts: tidy(strList(r.facts, 6)),
    missing: tidy(strList(r.missing, 2)),
    urgency: oneOf(r.urgency, ['critical', 'high', 'normal', 'low'] as const, f.urgency),
    urgency_reason: r.urgency_reason?.trim() || '',
    mode: oneOf(r.mode, ['answer', 'request', 'steps', 'escalate'] as const, f.mode),
    structure: oneOf(r.structure, ['clear', 'loose'] as const, f.structure),
    difficulty: oneOf(r.difficulty, ['easy', 'hard'] as const, f.difficulty),
    title: title ? title.slice(0, 80) : f.title,
    estimated_seconds: Math.min(
      900,
      Math.max(3, Number(r.estimated_seconds) || f.estimated_seconds),
    ),
  };
}

const GREETING =
  /^(добр(ый|ое|ого)\s+(день|вечер|утро)|здравствуй(те)?|привет(ствую)?|hi|hello|спасибо|ок(ей)?)[\s.!?,)]*$/i;
const GREETING_PREFIX =
  /^(добр(ый|ое|ого)\s+(день|вечер|утро)|здравствуй(те)?|привет(ствую)?)[\s,!.]+(?=\S)/i;
/** Запасные уточнения без привязки к ИТ (ТЗ v4.13). */
const GENERIC_MISSING = [
  'Что именно нужно сделать или что происходит — подробнее',
  'Где это: сайт, приложение, программа, устройство или место',
];
const QUESTION_WORD =
  /^(как|где|что|почему|зачем|когда|можно|какой|какая|какие|каким|сколько|чем|куда|откуда)(?=\s|$)/i;

/**
 * Короткое обращение без подробностей («Не могу сделать презентацию»): модель часто считает его
 * лёгким и чётким и сразу «отвечает» — встречным вопросом. Такое сначала уточняем (ТЗ v4.10).
 * Вопросы-консультации («Как сменить пароль от почты?») и срочное не трогаем.
 */
export function askForDetails(t: Triage, text: string): Triage {
  if (t.mode !== 'answer' || t.urgency === 'critical' || t.missing.length) return t;
  const lines = text
    .split('\n')
    // «Добрый день, не могу…» — приветствие в начале строки тоже не часть обращения
    .map((l) => l.trim().replace(GREETING_PREFIX, ''))
    .filter((l) => l && !GREETING.test(l));
  const request = lines.join(' ');
  const words = request.match(/[a-zа-яё0-9]+/gi) ?? [];
  if (words.length > 5 || t.facts.length > 1) return t;
  if (/\?/.test(request) || QUESTION_WORD.test(request) || ARITHMETIC.test(request)) return t;
  return {
    ...t,
    structure: 'loose',
    missing: GENERIC_MISSING,
  };
}

/** Шаг решения (ТЗ v4.21): ответ человек пишет сам, кнопок «Да / Нет» больше нет. */
function normalizeStep(x: Partial<SolutionStep> & { title: string }): SolutionStep {
  const clip = (v: unknown, n: number) =>
    String(v ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, n);
  return {
    title: x.title.trim(),
    instruction: clip(x.instruction, 400),
    check: clip(x.check, 120),
    yes: '',
    no: '',
  };
}

/** Фраза организации в конце ответа — после текста модели, с пустой строкой. */
async function* withSignature(
  chunks: AsyncGenerator<string>,
  sign: string,
): AsyncGenerator<string> {
  yield* chunks;
  if (sign) yield `\n\n${sign}`;
}

/**
 * «Размыто», а уточнять нечего — противоречие разбора (ТЗ v4.13): для ответа и заявки
 * сначала спрашиваем, что именно нужно. Срочное не задерживаем.
 */
function needsDetails(t: Triage): Triage {
  if (t.structure !== 'loose' || t.missing.length || t.urgency === 'critical') return t;
  if (t.mode !== 'answer' && t.mode !== 'request') return t;
  return { ...t, missing: GENERIC_MISSING };
}

/** Оценка ответа от модели → проверенные поля; кнопки — короткие, без повторов. */
function normalizeOutcome(r: Partial<AnswerOutcome>, fb: AnswerOutcome): AnswerOutcome {
  const state = (['need_info', 'in_progress', 'final'] as const).includes(r.state as never)
    ? (r.state as AnswerOutcome['state'])
    : fb.state;
  const seen = new Set<string>();
  let buttons = (Array.isArray(r.buttons) ? r.buttons : [])
    .map((b) =>
      typeof b === 'string'
        ? b
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/[.!]+$/, '')
        : '',
    )
    .filter((b) => b && b.length <= 40 && !seen.has(b.toLowerCase()) && seen.add(b.toLowerCase()))
    .slice(0, 4);
  // «готово» и «часть сделана» — ровно пара «да / нет», иначе кнопки по умолчанию
  if ((state === 'final' || state === 'in_progress') && buttons.length !== 2) buttons = [];
  const question = typeof r.question === 'string' ? r.question.trim().slice(0, 200) : '';
  return { state, question: state === 'final' ? '' : question, buttons };
}
