import { Injectable } from '@nestjs/common';
import { viewOf, type CannedAnswer, type CannedView, type Candidate } from '../org/answers';
import { AnswersService } from '../org/answers.service';
import { censor, CensorStream, type FiredRule } from '../org/rules';
import { RulesService } from '../org/rules.service';
import { samplesBlock, type AnswerSample } from '../org/samples';
import { SamplesService } from '../org/samples.service';
import { offerText, requestText, routeOf } from './flow';
import { honestHandoff } from './honesty';
import { LlmService } from './llm.service';
import { StreamCleaner } from './stream-cleaner';
import type { ChatMessage, QuestionsResult, Triage } from './types';

export type RoutedTriage = Triage & { canned: CannedView | null };

/**
 * Путь обращения на сервере (ТЗ v4.26–v4.27): разбор + готовый ответ + жёсткие правила → путь;
 * уточняющие вопросы и ответ — без запрещённых фраз, ответ — с образцами организации.
 * Общий для живых обращений (эндпоинты /api/llm/*) и прогона проверочных вопросов.
 */
@Injectable()
export class FlowService {
  constructor(
    private readonly llm: LlmService,
    private readonly answers: AnswersService,
    private readonly rules: RulesService,
    private readonly samples: SamplesService,
  ) {}

  /**
   * Жёсткие правила организации (ТЗ v4.26) сильнее мнения модели: срочно, сразу к специалисту
   * (без уточнений и без готового ответа), трудная задача, сервис.
   */
  applyRules(tr: Triage, list: FiredRule[]): Triage {
    if (!list.length) return tr;
    const out: Triage = { ...tr, rules: list.map((r) => ({ action: r.action, phrase: r.phrase })) };
    for (const r of list) {
      if (r.action === 'urgent') {
        out.urgency = 'critical';
        out.urgency_reason = `Правило организации: «${r.phrase}»`;
      }
      if (r.action === 'hard') out.difficulty = 'hard';
      if (r.action === 'service' && r.service) out.service = r.service;
      if (r.action === 'specialist') {
        out.mode = 'escalate';
        out.missing = [];
        if (r.note) out.rule_note = r.note;
      }
    }
    return out;
  }

  /**
   * Уточняющие вопросы — тоже слова помощника (ТЗ v4.26): без запрещённых фраз. Вопрос, от которого
   * ничего не осталось, убираем; варианты ответа с запрещённой фразой — тоже.
   */
  async censorQuestions(r: QuestionsResult): Promise<QuestionsResult> {
    const forbidden = await this.rules.forbidden();
    if (!forbidden.length) return r;
    return {
      intro: censor(r.intro, forbidden),
      questions: r.questions
        .map((q) => ({
          text: censor(q.text, forbidden).trim(),
          options: q.options.filter((o) => censor(o, forbidden).trim() === o.trim()),
        }))
        .filter((q) => q.text),
    };
  }

  /**
   * Готовый ответ организации (ТЗ v4.25): кандидаты по словам → модель решает по смыслу.
   * Модель недоступна — только сильное совпадение слов (фраза из 2+ слов, без равного соперника).
   */
  async pickCanned(
    text: string,
    model?: string | null,
  ): Promise<{
    answer: CannedAnswer | null;
    reason: string;
    source: 'ai' | 'words' | 'none';
    list: Candidate[];
  }> {
    const list = await this.answers.candidates(text);
    if (!list.length)
      return { answer: null, reason: 'по словам ничего не нашлось', source: 'none', list };
    try {
      const r = await this.llm.pickCanned(
        text,
        list.map((c) => ({ title: c.answer.title, when: c.answer.when, body: c.answer.body })),
        model,
      );
      return {
        answer: r.index === null ? null : list[r.index]!.answer,
        reason: r.reason,
        source: 'ai',
        list,
      };
    } catch {
      const top = list[0]!;
      const strong = top.score >= 2 && (list.length === 1 || list[1]!.score < top.score);
      return {
        answer: strong ? top.answer : null,
        reason: strong
          ? `ИИ недоступен — сильное совпадение: «${top.keyword}»`
          : 'ИИ недоступен, совпадение слабое',
        source: 'words',
        list,
      };
    }
  }

  /**
   * Разбор обращения с готовым ответом и правилами — и путь дальше (`route`).
   * count — считать ли показ готового ответа в статистике (прогон проверочных вопросов — не считает).
   */
  async triage(
    text: string,
    history: ChatMessage[],
    model?: string | null,
    { count = true }: { count?: boolean } = {},
  ): Promise<RoutedTriage> {
    // разбор и подбор готового ответа организации — параллельно (ТЗ v4.25)
    const [tr, canned] = await Promise.all([
      this.llm.triage(text, model, history),
      this.pickCanned(text, model).catch(() => null),
    ]);
    // обращения нет («F», «привет») — правила не применяем; живой ответ — без запрещённых фраз
    if (tr.meaningful === false) {
      const forbidden = await this.rules.forbidden();
      const out = { ...tr, reply: censor(tr.reply ?? '', forbidden), canned: null };
      return { ...out, route: routeOf(out) };
    }
    const ruled = this.applyRules(tr, await this.rules.fired(text));
    // «Сразу к специалисту» по правилу — готовый ответ не показываем
    const toSpecialist = ruled.rules?.some((r) => r.action === 'specialist');
    const answer = toSpecialist ? null : (canned?.answer ?? null);
    if (answer && count) await this.answers.count(answer.id, 'shown');
    const out: RoutedTriage = { ...ruled, canned: answer ? viewOf(answer) : null };
    return {
      ...out,
      route: routeOf(out),
      ...(out.mode === 'escalate' ? { offer: offerText(out) } : {}),
    };
  }

  /** Уточняющие вопросы режима поддержки — без запрещённых фраз. */
  async supportQuestions(
    history: ChatMessage[],
    focus: string[],
    urgent: boolean,
    model?: string | null,
  ): Promise<QuestionsResult> {
    return this.censorQuestions(await this.llm.supportQuestions(history, focus, urgent, model));
  }

  /** Образцы ответов для этой переписки (ТЗ v4.27): до 2 самых похожих на обращение. */
  async samplesFor(history: ChatMessage[]): Promise<AnswerSample[]> {
    return this.samples.pick(requestText(history));
  }

  /** Блок образцов для инструкции ответа. */
  async samplesPrompt(history: ChatMessage[]): Promise<string> {
    return samplesBlock(await this.samplesFor(history));
  }

  /** Фильтр запрещённого для потока ответа. */
  async censorStream(): Promise<CensorStream> {
    return new CensorStream(await this.rules.forbidden());
  }

  /**
   * Ответ целиком — как его увидит человек (для прогона проверочных вопросов): с образцами,
   * без запрещённых фраз и без выдуманной передачи специалисту.
   */
  async answer(
    history: ChatMessage[],
    model: string | null | undefined,
    signal: AbortSignal,
  ): Promise<{ text: string; samples: AnswerSample[] }> {
    const samples = await this.samplesFor(history);
    const { chunks } = await this.llm.stream(
      history,
      'answer',
      [],
      model,
      signal,
      samplesBlock(samples),
    );
    const cleaner = new StreamCleaner();
    for await (const c of chunks) cleaner.push(c);
    cleaner.end();
    const view = await this.censorStream();
    view.next(cleaner.text, true);
    return { text: honestHandoff(view.text.trim()), samples };
  }
}
