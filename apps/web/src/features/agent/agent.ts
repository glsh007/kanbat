import {
  CLOSE_REASON_LABELS,
  isChitChat,
  maskPersonalData,
  isProblemTask,
  type AgentStep,
  type AnswerOutcome,
  type ChatMessage,
  type ColumnId,
  type Escalation,
  type EscalationStatus,
  type Handoff,
  type Message,
  type PlanStep,
  type StepReplyResult,
  type StreamMode,
  type Triage,
} from '@app/shared';
import { useBoard } from '@/features/board/store';
import { faqById, rankFaq } from '@/features/faq/faq';
import { aiAvailable, ensureStatus } from './llmStatus';
import { isBareAck, localStepReply, withoutQuestions } from './stepWords';
import { claimsHandoff, honestHandoff } from './honesty';
import { sortTask } from '@/features/sections/sorter';
import { api, streamReply } from '@/lib/api';

/**
 * Оркестратор обращений (ТЗ v2, пп. 2–3, 13).
 *
 * Обращение → «Что произошло» (разбор: суть, сервис, факты, чего не хватает, срочность, режим)
 *   → Уточнение: вопросы ТОЛЬКО по недостающему (0–3; срочное — не больше 1)
 *   → режим:
 *       steps    — шаги по одному; ответ на шаг человек пишет сам (или «Сделал(а)»), ИИ отвечает
 *                  живой реакцией. Не помогло — новый шаг в тот же план, а не новый план (ТЗ v4.21)
 *                  → Проверка «Закрыть вопрос / Не помогло»
 *       answer   — ответ текстом (трудный — план ⏸ → выполнение), A без остановок до «Готово»
 *       escalate — ИИ честно говорит, что нужен специалист, и спрашивает, передать ли
 *
 * Специалист — только с согласия человека (ТЗ v4.21): после 2 неудач, при «самому не решить» или без ИИ
 * помощник ПРЕДЛАГАЕТ передать; отказались — снова не раньше чем через 2 неудачи.
 * Кнопка «Позвать специалиста» внизу есть всегда.
 *
 * Движение карточки задаёт приложение, а не служебные маркеры модели.
 * Сейчас оркестратор работает в браузере; на этапе отложенной отправки переедет на сервер.
 */

const S = () => useBoard.getState();
const task = (id: string) => S().tasks[id];
const TRANSIT_MS = 380;
/** После скольких неудач предложить специалиста (и сколько ждать после отказа). */
const OFFER_AFTER = 2;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

const controllers = new Map<string, AbortController>();

function begin(id: string): AbortSignal {
  controllers.get(id)?.abort();
  const c = new AbortController();
  controllers.set(id, c);
  return c.signal;
}

function end(id: string, signal: AbortSignal) {
  if (controllers.get(id)?.signal === signal) controllers.delete(id);
}

export function isRunning(id: string): boolean {
  return controllers.has(id);
}

const model = () => S().settings.model;
const urgent = (id: string) => task(id)?.urgency === 'critical';

async function moveTo(id: string, column: ColumnId, pause = true): Promise<void> {
  const t = task(id);
  if (!t || t.column === column) return;
  S().placeTask(id, column, 0);
  if (pause) await wait(TRANSIT_MS);
}

/** История чата в формате для модели (служебные блоки превращаются в текст). */
export function toChat(messages: Message[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (m.kind === 'error' || m.role === 'system') continue;
    let content = m.content;
    if (m.kind === 'questions' && m.questions)
      content = `${m.content}\n${m.questions.map((q, i) => `${i + 1}. ${q.text}`).join('\n')}`;
    if (m.kind === 'plan' && m.plan)
      content = `${m.content}\nПлан:\n${m.plan.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
    if (m.kind === 'steps' && m.steps)
      content = `${m.content}\n${m.steps.map((s, i) => `${i + 1}. ${s.title}: ${s.instruction}`).join('\n')}`;
    if (m.kind === 'triage' && m.triage)
      content = `Разбор: ${m.triage.summary}. Сервис: ${m.triage.service}. Срочность: ${m.triage.urgency}.`;
    if (m.kind === 'handoff') content = 'Обращение передано специалисту поддержки.';
    if (m.kind === 'specialist') content = `Специалист поддержки: ${m.content}`;
    out.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content });
  }
  return out;
}

const history = (id: string) => toChat(S().messages[id] ?? []);

/**
 * История для ответа по существу: без приветствий до обращения («Привет» → «Чем могу помочь?»)
 * и с последней репликой человека — иначе модель продолжает за собой и отвечает на приветствие.
 */
export function answerHistory(messages: Message[]): ChatMessage[] {
  let ti = -1;
  for (let i = messages.length - 1; i >= 0; i--)
    if (messages[i]!.kind === 'triage') {
      ti = i;
      break;
    }
  let list = messages;
  if (ti >= 0) {
    // начало обращения — подряд идущие реплики человека прямо перед разбором
    let start = ti;
    while (start > 0 && messages[start - 1]!.role === 'user') start--;
    // до него — только знакомство (приветствие и ответ на него), если там нет работы по обращению
    const before = messages.slice(0, start);
    if (before.every((m) => !m.kind)) list = messages.slice(start);
  }
  const out = toChat(list);
  const last = out.at(-1);
  if (last?.role === 'assistant')
    out.push({
      role: 'user',
      content: 'Ответь по существу на моё обращение выше (с учётом разбора).',
    });
  return out;
}

function short(text: string, n = 140): string {
  const plain = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > n ? `${plain.slice(0, n - 1)}…` : plain;
}

function fail(id: string, step: AgentStep, e: unknown) {
  if ((e as Error).name === 'AbortError') return;
  const message = (e as Error).message || 'Неизвестная ошибка';
  S().setLive(id, null);
  S().patchTask(id, {
    status: 'error',
    errorMessage: message,
    lastStep: step,
    checkpoint: null,
    // в списке не должно остаться «Пишу ответ…»
    preview: 'Ответ не пришёл — откройте и нажмите «Повторить»',
  });
  S().addMessage(id, { role: 'assistant', kind: 'error', content: message });
}

// ——— 1. Разбор обращения ———

/** Отправить обращение ИИ: разбор «что произошло» → маршрут. */
export async function start(id: string): Promise<void> {
  const t = task(id);
  if (!t) return;
  // ИИ недоступен — не притворяемся: частые вопросы и специалист
  await ensureStatus();
  if (!aiAvailable()) return offlineStart(id);
  const signal = begin(id);
  const msgs = S().messages[id] ?? [];
  if (!msgs.length) S().addMessage(id, { role: 'user', content: t.title });
  const text = (S().messages[id] ?? [])
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join('\n');

  S().patchTask(id, {
    status: 'awaiting_ai',
    preview: 'Разбираю обращение…',
    errorMessage: null,
    checkpoint: null,
    lastStep: 'classify',
  });
  try {
    const tr = await api.triage(text, history(id), model(), signal);
    const cur = task(id);
    if (!cur || signal.aborted) return;
    end(id, signal);
    if (tr.meaningful === false) return askToDescribe(id, tr);
    S().patchTask(id, {
      triage: tr,
      urgency: tr.urgency,
      structure: tr.structure,
      difficulty: tr.difficulty,
      estimatedSeconds: tr.estimated_seconds,
      title: cur.titleEdited ? cur.title : tr.title || cur.title,
      preview: tr.summary,
    });
    S().addMessage(id, { role: 'assistant', kind: 'triage', content: tr.summary, triage: tr });
    showHint(id);
    // в фоне: ИИ раскладывает задачу по разделам пользователя
    void sortTask(id);
    await moveTo(id, 'clarify');
    // Срочное с обходным путём — без вопросов; иначе — только по недостающему
    if (tr.missing.length && !(tr.urgency === 'critical' && tr.mode === 'steps'))
      return askQuestions(id);
    return proceed(id);
  } catch (e) {
    end(id, signal);
    fail(id, 'classify', e);
  }
}

// ——— Без ИИ: частые вопросы и специалист (ТЗ v4.1, п. 13.8) ———

const userText = (id: string) =>
  (S().messages[id] ?? [])
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join('\n');

/** ИИ недоступен: честно говорим об этом и предлагаем похожие частые вопросы. */
async function offlineStart(id: string, again = false): Promise<void> {
  const t = task(id);
  if (!t) return;
  if (!S().messages[id]?.length) S().addMessage(id, { role: 'user', content: t.title });
  await moveTo(id, 'clarify');
  S().addMessage(id, {
    role: 'assistant',
    kind: 'faq',
    content: again
      ? 'ИИ-помощник всё ещё недоступен. Выберите похожий вопрос или передайте обращение специалисту.'
      : 'ИИ-помощник сейчас недоступен, поэтому гадать не буду. Посмотрите готовые инструкции по похожим вопросам — или сразу передайте обращение специалисту: он увидит ваше сообщение целиком.',
    faq: rankFaq(userText(id)).map((f) => f.id),
  });
  S().patchTask(id, {
    status: 'awaiting_user',
    checkpoint: 'faq',
    pendingQuestions: 0,
    errorMessage: null,
    preview: 'ИИ недоступен — выберите частый вопрос или передайте специалисту',
  });
}

/** Выбран частый вопрос: готовая инструкция и «Помогло?». */
export async function faqAnswer(id: string, topicId: string): Promise<void> {
  const t = task(id);
  const topic = faqById(topicId);
  if (!t || !topic) return;
  S().addMessage(id, { role: 'user', content: topic.title });
  S().addMessage(id, {
    role: 'assistant',
    content: `### ${topic.title}\n\n${topic.body}`,
    canned: true,
    model: null,
  });
  await moveTo(id, 'review');
  S().patchTask(id, {
    // это не разбор ИИ, а выбранная тема: нужна, чтобы проверка звучала «Закрыть вопрос / Не помогло»
    triage: {
      meaningful: true,
      reply: '',
      summary: userText(id).split('\n')[0] || topic.title,
      service: topic.service,
      facts: [],
      missing: [],
      urgency: t.urgency,
      urgency_reason: '',
      mode: 'steps',
      structure: 'clear',
      difficulty: 'easy',
      title: t.title,
      estimated_seconds: 0,
    },
    status: 'awaiting_user',
    checkpoint: 'review',
    pendingQuestions: 1,
    preview: `Инструкция: ${topic.title}. Помогло?`,
  });
}

/**
 * Обращения пока нет («F», «привет», «ничего не случилось»): ничего не придумываем — отвечаем
 * по-человечески (ответ пишет модель по переписке) и ждём, что человек расскажет.
 * Следующее сообщение запускает разбор заново; «Закрыть обращение» — если помощь не нужна.
 */
async function askToDescribe(id: string, tr: Triage): Promise<void> {
  await moveTo(id, 'clarify');
  const text = tr.reply?.trim() || 'Пока не понял, с чем нужна помощь. Расскажите, что случилось?';
  S().addMessage(id, { role: 'assistant', content: text });
  S().patchTask(id, {
    triage: tr,
    status: 'awaiting_user',
    checkpoint: 'describe',
    questions: null,
    pendingQuestions: 0,
    preview: short(text, 90),
  });
}

/** «Закрыть обращение»: помощь не понадобилась. */
export async function close(id: string): Promise<void> {
  const t = task(id);
  if (!t) return;
  controllers.get(id)?.abort();
  await moveTo(id, 'done', false);
  S().patchTask(id, {
    status: 'idle',
    checkpoint: null,
    pendingQuestions: 0,
    errorMessage: null,
    preview: 'Закрыто: помощь не понадобилась',
  });
}

// ——— 2. Уточнение: только недостающее ———

export async function askQuestions(id: string): Promise<void> {
  const t = task(id);
  if (!t) return;
  const signal = begin(id);
  await moveTo(id, 'clarify', false);
  S().patchTask(id, {
    status: 'awaiting_ai',
    preview: 'Готовлю уточняющие вопросы…',
    lastStep: 'questions',
  });
  try {
    const r = t.triage
      ? await api.supportQuestions(
          history(id),
          t.triage.missing,
          t.urgency === 'critical',
          model(),
          signal,
        )
      : await api.questions(history(id), t.difficulty === 'hard', model(), signal);
    if (signal.aborted) return;
    end(id, signal);
    if (!r.questions.length) return proceed(id);
    S().addMessage(id, {
      role: 'assistant',
      kind: 'questions',
      content: r.intro,
      questions: r.questions,
    });
    S().patchTask(id, {
      status: 'awaiting_user',
      checkpoint: 'questions',
      questions: r.questions,
      pendingQuestions: r.questions.length,
      preview: r.questions[0]?.text ?? r.intro,
    });
  } catch (e) {
    end(id, signal);
    fail(id, 'questions', e);
  }
}

/** Куда идти, когда данных достаточно. */
async function proceed(id: string): Promise<void> {
  const t = task(id);
  if (!t) return;
  const mode = t.triage?.mode;
  // «самому не решить» — не передаём молча, а спрашиваем (ТЗ v4.21)
  if (mode === 'escalate') {
    await moveTo(id, 'working');
    return offerSpecialist(id, 'Самостоятельно эту проблему не решить', {
      say: 'Похоже, тут без специалиста не обойтись: самому это не исправить. Передать ему обращение? Он получит короткую сводку — пересказывать ничего не придётся.',
    });
  }
  if (mode === 'steps') return solve(id);
  // карточка без разбора (старые данные) — сначала разбор, как у всех (единая инструкция, ТЗ v4.13)
  if (!t.triage) return start(id);
  // вопрос (answer) и заявка (request): ответ по существу; этап после него — по оценке ответа
  return run(id, 'answer');
}

/** Подсказка «специалист всегда рядом» — один раз на обращение (ТЗ v4.21). */
function showHint(id: string) {
  const t = task(id);
  if (!t || t.hintShown) return;
  S().addMessage(id, {
    role: 'assistant',
    kind: 'hint',
    content:
      'Если захотите поговорить с человеком — кнопка «Позвать специалиста» всегда внизу, под полем ввода.',
  });
  S().patchTask(id, { hintShown: true });
}

// ——— 3. Решение по шагам ———

/** Шаг в переписке — обычным текстом, как сказал бы человек рядом. */
function stepProse(step: PlanStep, n: number, total: number): string {
  const head = total > 1 ? `**Шаг ${n} из ${total}. ${step.title}.**` : `**${step.title}.**`;
  return [head, step.instruction].filter(Boolean).join(' ');
}

const stepPreview = (plan: PlanStep[], i: number) =>
  plan.length > 1 ? `Шаг ${i + 1} из ${plan.length}: ${plan[i]!.title}` : plan[i]!.title;

/** Сценарий решения: один шаг — простым текстом, несколько — компактный чек-лист (ТЗ v4.21). */
export async function solve(id: string): Promise<void> {
  const t = task(id);
  if (!t) return;
  const attempt = t.attempts + 1;
  const signal = begin(id);
  await moveTo(id, 'working');
  S().patchTask(id, {
    status: 'awaiting_ai',
    checkpoint: null,
    pendingQuestions: 0,
    errorMessage: null,
    preview:
      attempt > 1
        ? 'Думаю, что ещё можно сделать…'
        : urgent(id)
          ? 'Ищу самый быстрый обходной путь…'
          : 'Думаю, с чего начать…',
    lastStep: 'steps',
  });
  try {
    const r = await api.steps(history(id), urgent(id), attempt, model(), signal);
    if (signal.aborted) return;
    end(id, signal);
    if (!r.self_solvable || !r.steps.length) {
      const why = r.escalate_reason || 'Самостоятельно не решить';
      return offerSpecialist(id, why, {
        say: `${r.intro && r.intro !== 'Пройдём по шагам.' ? `${r.intro} ` : ''}Похоже, самому это не исправить: ${lower(why)}. Передать обращение специалисту? Он получит короткую сводку — пересказывать ничего не придётся.`,
      });
    }
    const plan: PlanStep[] = r.steps.map((s) => ({
      title: s.title,
      instruction: s.instruction,
      check: s.check,
      done: false,
    }));
    S().addMessage(id, { role: 'assistant', kind: 'steps', content: r.intro, steps: r.steps });
    S().patchTask(id, {
      attempts: attempt,
      stepIndex: 0,
      plan,
      status: 'awaiting_user',
      checkpoint: 'step',
      pendingQuestions: 1,
      preview: stepPreview(plan, 0),
    });
  } catch (e) {
    end(id, signal);
    fail(id, 'steps', e);
  }
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1).replace(/\.$/, '');

/**
 * Ответ человека на шаг своими словами (ТЗ v4.21): ИИ понимает, что произошло, и отвечает
 * живой реакцией; без модели — разбор по словам.
 */
async function stepAnswer(id: string, text: string): Promise<void> {
  const t = task(id);
  if (!t?.plan || t.checkpoint !== 'step') return;
  const index = t.stepIndex;
  if (!t.plan[index]) return;
  S().addMessage(id, { role: 'user', content: text });
  S().patchTask(id, {
    status: 'awaiting_ai',
    checkpoint: null,
    pendingQuestions: 0,
    errorMessage: null,
    preview: 'Читаю ваш ответ…',
    lastStep: 'step-reply',
  });
  let r: StepReplyResult | null = null;
  if (aiAvailable()) {
    const signal = begin(id);
    try {
      r = await api.stepReply(history(id), t.plan, index, urgent(id), model(), signal);
    } catch {
      // модель ошиблась или не ответила — разбираем по словам, шагов не выдумываем
    }
    if (signal.aborted) return;
    end(id, signal);
  }
  return applyStepReply(id, index, text, r ?? localStepReply(text, t.plan, index));
}

async function applyStepReply(
  id: string,
  index: number,
  text: string,
  reply: StepReplyResult,
): Promise<void> {
  const t = task(id);
  if (!t?.plan) return;
  let r = reply;
  // переспрос по кругу (ТЗ v4.23): тот же вопрос шага, хотя человек ответил, или второй переспрос
  // на том же шаге — идём дальше по плану, без вопросов
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^а-яёa-z0-9]+/g, ' ')
      .trim();
  const repeatsCheck = !!t.plan[index]?.check && norm(r.reply) === norm(t.plan[index]!.check!);
  if (r.outcome === 'ask' && ((repeatsCheck && !isBareAck(text)) || t.askedStep === index))
    r = { outcome: 'done', reply: withoutQuestions(r.reply), step: null };
  const say = (content: string) =>
    content.trim() && S().addMessage(id, { role: 'assistant', content, reaction: true });
  const waitStep = (plan: PlanStep[], i: number) =>
    S().patchTask(id, {
      plan,
      stepIndex: i,
      status: 'awaiting_user',
      checkpoint: 'step',
      pendingQuestions: 1,
      preview: stepPreview(plan, i),
    });
  const mark = (result: 'ok' | 'fail') =>
    t.plan!.map((p, i) =>
      i === index ? { ...p, done: result === 'ok', result, answer: text.slice(0, 300) } : p,
    );

  switch (r.outcome) {
    case 'ask': {
      say(r.reply || 'Что получилось в итоге?');
      S().patchTask(id, {
        status: 'awaiting_user',
        checkpoint: 'step',
        askedStep: index,
        pendingQuestions: 1,
        preview: short(r.reply || 'Что получилось в итоге?', 110),
      });
      return;
    }
    case 'solved': {
      S().patchTask(id, { plan: mark('ok') });
      say(r.reply || 'Отлично, рад, что всё заработало!');
      return accept(id);
    }
    case 'done': {
      const plan = mark('ok');
      const next = index + 1;
      if (next < plan.length) {
        say([r.reply, stepProse(plan[next]!, next + 1, plan.length)].filter(Boolean).join('\n\n'));
        return waitStep(plan, next);
      }
      say(r.reply || 'Все шаги пройдены.');
      S().patchTask(id, { plan, stepIndex: next });
      await moveTo(id, 'review');
      S().patchTask(id, {
        status: 'awaiting_user',
        checkpoint: 'review',
        pendingQuestions: 1,
        preview: 'Все шаги пройдены. Всё в порядке?',
      });
      return;
    }
    case 'specialist': {
      say(r.reply);
      return offerSpecialist(id, 'Помощник считает, что нужен специалист', { asked: !!r.reply });
    }
    case 'failed':
    case 'other': {
      const failures = (t.failures ?? 0) + 1;
      let plan = mark('fail');
      const next = index + 1;
      // новый шаг — в тот же план, сразу после неудачного (ТЗ v4.21)
      if (r.step)
        plan = [
          ...plan.slice(0, next),
          { ...r.step, done: false, added: true },
          ...plan.slice(next),
        ];
      S().patchTask(id, { failures });
      if (next >= plan.length) {
        // идей больше нет — честно предлагаем специалиста
        S().patchTask(id, { plan, stepIndex: next });
        say(r.reply);
        return offerSpecialist(
          id,
          aiAvailable() ? 'Шаги не помогли' : 'Шаги не помогли, ИИ недоступен',
          {
            say: 'Больше идей, что можно сделать самому, у меня нет. Передать обращение специалисту? Он увидит, что вы уже пробовали.',
          },
        );
      }
      say([r.reply, stepProse(plan[next]!, next + 1, plan.length)].filter(Boolean).join('\n\n'));
      waitStep(plan, next);
      if (shouldOffer(id)) return offerSpecialist(id, `${failures} шага не помогли`);
      return;
    }
  }
}

/** Пора ли предложить специалиста: 2 неудачи, а после отказа — ещё 2. */
function shouldOffer(id: string): boolean {
  const t = task(id);
  if (!t) return false;
  const n = t.failures ?? 0;
  const declined = t.offerDeclinedAt;
  return n >= OFFER_AFTER && (declined == null || n >= declined + OFFER_AFTER);
}

/**
 * Предложить передать обращение специалисту — без передачи (ТЗ v4.21).
 * say — реплика помощника (если нет — вопрос виден в панели внизу); asked — вопрос уже задан в чате.
 */
function offerSpecialist(
  id: string,
  reason: string,
  opts: { say?: string; asked?: boolean } = {},
): void {
  const t = task(id);
  if (!t) return;
  if (opts.say) S().addMessage(id, { role: 'assistant', content: opts.say, reaction: true });
  S().patchTask(id, {
    offer: {
      reason,
      continueLabel: aiAvailable() ? 'Продолжить с ИИ' : 'Другие инструкции',
      at: now(),
    },
    status: 'awaiting_user',
    checkpoint: 'offer',
    pendingQuestions: 1,
    errorMessage: null,
    preview: 'Передать обращение специалисту?',
  });
}

/** «Передать специалисту» в предложении. */
export async function acceptOffer(id: string): Promise<void> {
  const t = task(id);
  if (!t || t.checkpoint !== 'offer') return;
  S().addMessage(id, { role: 'user', content: 'Передать специалисту' });
  const reason = t.offer?.reason || 'Пользователь попросил специалиста';
  S().patchTask(id, { offer: null, checkpoint: null, pendingQuestions: 0 });
  return escalate(id, reason);
}

/** «Продолжить с ИИ»: предложение закрыто, снова предложим не раньше чем через 2 неудачи. */
export async function declineOffer(id: string, text?: string): Promise<void> {
  const t = task(id);
  if (!t || t.checkpoint !== 'offer') return;
  const label = t.offer?.continueLabel || 'Продолжить с ИИ';
  S().patchTask(id, {
    offer: null,
    offerDeclinedAt: t.failures ?? 0,
    checkpoint: null,
    pendingQuestions: 0,
  });
  const step = t.plan?.[t.stepIndex];
  // ответил своими словами — продолжаем разговор: как ответ на шаг, реплику или (без ИИ) поиск инструкций
  if (text) {
    S().patchTask(id, {
      status: 'awaiting_user',
      checkpoint: step && !step.result ? 'step' : aiAvailable() ? 'ask' : 'faq',
      pendingQuestions: 1,
      replyOptions: null,
    });
    return reply(id, text);
  }
  S().addMessage(id, { role: 'user', content: label });
  if (step && !step.result) {
    S().addMessage(id, {
      role: 'assistant',
      reaction: true,
      content: `Хорошо, продолжаем. ${step.check || 'Напишите, как пройдёт шаг.'}`,
    });
    S().patchTask(id, {
      status: 'awaiting_user',
      checkpoint: 'step',
      pendingQuestions: 1,
      preview: stepPreview(t.plan!, t.stepIndex),
    });
    return;
  }
  await ensureStatus();
  if (!aiAvailable()) return offlineStart(id, true);
  const ask =
    'Хорошо, продолжаем. Расскажите, что сейчас происходит, — подумаю, что ещё можно сделать.';
  S().addMessage(id, { role: 'assistant', content: ask, reaction: true });
  S().patchTask(id, {
    status: 'awaiting_user',
    checkpoint: 'ask',
    pendingQuestions: 1,
    replyOptions: null,
    askText: 'Что сейчас происходит?',
    preview: short(ask, 110),
  });
}

/**
 * «Не помогло» в Проверке (или «Доработать» у обращения-проблемы): помощник реагирует и предлагает
 * ещё одно действие в том же плане; специалиста — только предлагает (ТЗ v4.21).
 */
export async function notSolved(id: string, detail?: string): Promise<void> {
  const t = task(id);
  if (!t) return;
  const text = detail?.trim() ? detail.trim() : 'Не помогло';
  S().addMessage(id, { role: 'user', content: text });
  if (t.escalation) return backToSpecialist(id);
  const failures = (t.failures ?? 0) + 1;
  S().patchTask(id, { failures, checkpoint: null, pendingQuestions: 0 });
  await ensureStatus();
  if (!aiAvailable()) {
    await moveTo(id, 'working');
    return offerSpecialist(id, 'Готовая инструкция не помогла, ИИ недоступен', {
      say: 'Жаль, что не помогло. ИИ-помощник сейчас недоступен, поэтому могу предложить другие инструкции — или передать обращение специалисту. Передать?',
    });
  }
  if (shouldOffer(id)) {
    await moveTo(id, 'working');
    return offerSpecialist(id, `${failures} попытки решения не помогли`, {
      say: 'Жаль, что пока не получилось. Могу передать обращение специалисту — он увидит всё, что вы уже пробовали. Или продолжим вместе?',
    });
  }
  const plan = t.plan;
  if (!plan?.length) return run(id, 'answer');
  // все шаги пройдены, а проблема осталась — одно новое действие в конец плана
  const index = plan.length - 1;
  const signal = begin(id);
  await moveTo(id, 'working');
  S().patchTask(id, {
    status: 'awaiting_ai',
    preview: 'Думаю, что ещё можно сделать…',
    lastStep: 'step-reply',
  });
  let r: StepReplyResult | null = null;
  try {
    r = await api.stepReply(history(id), plan, index, urgent(id), model(), signal);
  } catch {
    r = null;
  }
  if (signal.aborted) return;
  end(id, signal);
  const say = (content: string) =>
    content.trim() && S().addMessage(id, { role: 'assistant', content, reaction: true });
  if (r?.step && (r.outcome === 'failed' || r.outcome === 'other')) {
    const next: PlanStep[] = [...plan, { ...r.step, done: false, added: true }];
    say([r.reply, stepProse(next.at(-1)!, next.length, next.length)].filter(Boolean).join('\n\n'));
    S().patchTask(id, {
      plan: next,
      stepIndex: next.length - 1,
      status: 'awaiting_user',
      checkpoint: 'step',
      pendingQuestions: 1,
      preview: stepPreview(next, next.length - 1),
    });
    return;
  }
  if (r?.outcome === 'solved') {
    say(r.reply);
    return accept(id);
  }
  if (r?.reply && r.outcome === 'ask') {
    say(r.reply);
    S().patchTask(id, {
      status: 'awaiting_user',
      checkpoint: 'ask',
      pendingQuestions: 1,
      replyOptions: null,
      askText: short(r.reply, 110),
      preview: short(r.reply, 110),
    });
    return;
  }
  if (r?.reply) say(r.reply);
  return offerSpecialist(id, 'Шаги не помогли', {
    say: r?.reply
      ? undefined
      : 'Больше идей, что можно сделать самому, у меня нет. Передать обращение специалисту? Он увидит, что вы уже пробовали.',
    asked: !!r?.reply,
  });
}

/** «Закрыть вопрос» (ТЗ v4.23; было «Решено»). */
export async function solved(id: string): Promise<void> {
  const t = task(id);
  if (!t) return;
  S().addMessage(id, { role: 'user', content: 'Закрываю вопрос' });
  return accept(id);
}

// ——— 4. Передача специалисту ———

/** Смена статуса передачи. Ревизия растёт — так сервер понимает, чьё изменение новее. */
function setEscalation(id: string, status: EscalationStatus, patch: Partial<Escalation> = {}) {
  const t = task(id);
  if (!t?.escalation) return;
  S().patchTask(id, {
    escalation: {
      ...t.escalation,
      ...patch,
      status,
      updatedAt: now(),
      rev: (t.escalation.rev ?? 0) + 1,
    },
  });
}

/** Детерминированная часть сводки — прямо из переписки (не зависит от модели). */
function baseHandoff(id: string): Omit<Handoff, 'hypothesis' | 'result' | 'notes'> {
  const t = task(id)!;
  const msgs = S().messages[id] ?? [];
  const original = msgs.find((m) => m.role === 'user')?.content ?? t.title;
  const qa = msgs.filter((m) => m.answerTo).map((m) => ({ q: m.answerTo!, a: m.content }));
  const fromPlan = (t.plan ?? [])
    .filter((p) => p.result)
    .map((p) => `${p.title} — ${p.answer || (p.result === 'ok' ? 'выполнено' : 'не помогло')}`);
  // до v4.21 итоги шагов хранились в сообщениях (кнопки «Да / Нет»)
  const actions = fromPlan.length
    ? fromPlan
    : msgs
        .filter((m) => m.stepReport)
        .map(
          (m) =>
            `${m.stepReport!.title} — ${m.stepReport!.answer ?? (m.stepReport!.ok ? 'выполнено' : 'не помогло')}`,
        );
  return { original, qa, actions, service: t.triage?.service ?? '—', urgency: t.urgency };
}

/** Передать обращение специалисту со сводкой (ТЗ v2, п. 13.6). */
export async function escalate(
  id: string,
  reason = 'Пользователь попросил специалиста',
  /** ИИ отвечает слишком долго — передаём сразу, сводка из переписки без анализа. */
  skipAi = false,
): Promise<void> {
  const t = task(id);
  if (!t) return;
  if (t.escalation && t.escalation.status !== 'resolved') return;
  const signal = begin(id);
  await moveTo(id, 'working');
  S().patchTask(id, {
    status: 'awaiting_ai',
    checkpoint: null,
    pendingQuestions: 0,
    preview: 'Готовлю сводку для специалиста…',
    lastStep: 'handoff',
  });
  const base = baseHandoff(id);
  const offline = !aiAvailable() || skipAi;
  let handoff: Handoff;
  try {
    // без ИИ сводку не выдумываем — только то, что есть в переписке
    if (offline) throw new Error('ИИ недоступен');
    const r = await api.handoff(history(id), model(), signal);
    if (signal.aborted) return;
    handoff = {
      ...base,
      hypothesis: r.hypothesis || t.triage?.summary || '',
      actions: base.actions.length ? base.actions : r.actions,
      result: r.result,
      notes: [t.triage?.urgency === 'critical' ? `Срочно: ${t.triage.urgency_reason}` : '', r.notes]
        .filter(Boolean)
        .join(' '),
    };
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    // Модель недоступна — всё равно передаём: сводка из переписки лучше, чем ничего
    handoff = {
      ...base,
      hypothesis: offline ? '' : (t.triage?.summary ?? ''),
      result: base.actions.length ? 'Проблема сохраняется после выполненных шагов.' : '',
      notes: skipAi
        ? 'ИИ отвечал слишком долго — сводка собрана из переписки без анализа.'
        : offline
          ? 'ИИ был недоступен — сводка собрана из переписки без анализа.'
          : (t.triage?.urgency_reason ?? ''),
    };
  } finally {
    end(id, signal);
  }
  const escalation: Escalation = {
    status: 'new',
    handoff,
    reason,
    createdAt: now(),
    updatedAt: now(),
    // повторная передача после «Закрыть вопрос» должна перекрыть старый статус на сервере
    rev: (task(id)?.escalation?.rev ?? 0) + 1,
  };
  S().addMessage(id, {
    role: 'assistant',
    kind: 'handoff',
    content: offline
      ? 'Передаю обращение специалисту со сводкой из нашей переписки — пересказывать ничего не нужно. Если захотите что-то добавить, просто напишите здесь.'
      : `Передаю обращение специалисту: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}. Он получит короткую сводку — пересказывать ничего не нужно.`,
    handoff,
  });
  S().patchTask(id, {
    escalation,
    offer: null,
    recipient: 'support',
    status: 'with_support',
    checkpoint: null,
    preview: 'Передано специалисту — ждёт ответа',
  });
}

/** Пользователь сообщил, что ответ специалиста не помог, — обращение снова у специалиста. */
async function backToSpecialist(id: string): Promise<void> {
  const st = task(id)?.escalation?.status;
  // закрытую заявку человек возобновил — она снова в общей очереди (ТЗ v4.22); в очереди — там и остаётся
  const reopen = st === 'resolved' || st === 'new';
  setEscalation(id, reopen ? 'new' : 'in_progress', {
    closed: null,
    closeAt: null,
    remindAt: null,
  });
  await moveTo(id, 'working');
  S().patchTask(id, {
    status: 'with_support',
    checkpoint: null,
    closeReminded: null,
    preview: reopen ? 'Снова в очереди поддержки' : 'Снова у специалиста',
  });
}

const dayFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const hmFmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

/** «сегодня в 18:40», «завтра в 09:15», «3 октября в 10:00». */
export function whenLabel(iso: string, nowMs = Date.now()): string {
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(new Date(nowMs))) / 86_400_000);
  const at = `в ${hmFmt.format(d)}`;
  if (diff === 0) return `сегодня ${at}`;
  if (diff === 1) return `завтра ${at}`;
  return `${dayFmt.format(d)} ${at}`;
}

/**
 * Напоминание об автозакрытии (ТЗ v4.22): специалист ответил, а человек молчит — один раз
 * говорим в чате, что обращение закроется само и как этого избежать.
 */
export function remindClose(id: string, nowMs = Date.now()): void {
  const t = task(id);
  const e = t?.escalation;
  if (!t || !e || e.status !== 'answered' || !e.closeAt || !e.remindAt) return;
  if (t.column === 'done' || t.closeReminded === e.closeAt) return;
  if (Date.parse(e.remindAt) > nowMs) return;
  S().addMessage(id, {
    role: 'assistant',
    kind: 'hint',
    content: `Если вопрос решён — нажмите «Закрыть вопрос». Если нет — напишите, что не так. Иначе обращение закроется автоматически ${whenLabel(e.closeAt, nowMs)}.`,
  });
  S().patchTask(id, { closeReminded: e.closeAt });
}

// ——— Ответы и статусы от специалиста (приходят с сервера, features/support/sync.ts) ———

/** Специалист ответил: сообщение в чат, карточка — в «Проверку» («Помогло?»). */
export async function receiveSpecialistReply(
  id: string,
  reply: { id: string; text: string; authorName: string },
): Promise<void> {
  const clean = reply.text.trim();
  if (!clean || !task(id)) return;
  S().addMessage(id, {
    id: `reply-${reply.id}`,
    role: 'assistant',
    kind: 'specialist',
    content: clean,
  });
  await moveTo(id, 'review');
  S().patchTask(id, {
    status: 'awaiting_user',
    checkpoint: 'review',
    pendingQuestions: 1,
    preview: `${reply.authorName || 'Специалист'}: ${short(clean, 110)}`,
  });
}

/** Статус с сервера новее нашего — принимаем без повышения ревизии. */
export async function receiveEscalationStatus(id: string, server: Escalation): Promise<void> {
  const t = task(id);
  if (!t?.escalation) return;
  const before = t.escalation.status;
  S().patchTask(id, {
    escalation: {
      ...t.escalation,
      status: server.status,
      rev: server.rev ?? t.escalation.rev,
      updatedAt: server.updatedAt,
      closed: server.closed ?? null,
      closeAt: server.closeAt ?? null,
      remindAt: server.remindAt ?? null,
    },
  });
  const closed = server.closed;
  if (server.status === 'resolved' && before !== 'resolved' && closed && closed.by !== 'user') {
    // закрылась сама или специалист закрыл без решения (ТЗ v4.22) — говорим почему и как вернуть
    S().addMessage(id, {
      role: 'assistant',
      content:
        closed.by === 'auto'
          ? 'Обращение закрыто автоматически: после ответа специалиста вы не ответили. Если проблема осталась — просто напишите здесь, и обращение вернётся в поддержку.'
          : `Специалист закрыл обращение без решения: ${CLOSE_REASON_LABELS[closed.reason ?? 'other']}${closed.note ? ` — «${closed.note}»` : ''}. Если это ошибка — напишите здесь, и обращение вернётся в очередь поддержки.`,
    });
    await moveTo(id, 'done', false);
    S().patchTask(id, {
      status: 'idle',
      checkpoint: null,
      pendingQuestions: 0,
      preview: closed.by === 'auto' ? 'Закрыто автоматически' : 'Закрыто специалистом без решения',
    });
    return;
  }
  // до v4.22 специалист мог «отметить решённым» — подтверждает всё равно человек (ТЗ v4.10)
  if (server.status === 'resolved' && t.column !== 'done' && before !== 'resolved' && !closed) {
    S().addMessage(id, {
      role: 'assistant',
      content: 'Специалист отметил обращение решённым. Проверьте, пожалуйста: проблема ушла?',
    });
    await moveTo(id, 'review');
    S().patchTask(id, {
      status: 'awaiting_user',
      checkpoint: 'review',
      pendingQuestions: 1,
      preview: 'Специалист считает, что решено — подтвердите',
    });
    return;
  }
  if (server.status === 'in_progress' && before === 'new')
    S().patchTask(id, { preview: 'Специалист принял обращение в работу' });
  if (server.status === 'new' && (before === 'in_progress' || before === 'answered'))
    S().patchTask(id, { preview: 'В общей очереди — ответит свободный специалист' });
}

// ——— Ответ текстом (вопросы-консультации, режим answer) ———

export async function makePlan(id: string, feedback?: string): Promise<void> {
  if (!task(id)) return;
  const signal = begin(id);
  await moveTo(id, 'working');
  S().patchTask(id, {
    status: 'awaiting_ai',
    checkpoint: null,
    preview: feedback ? 'Переделываю план…' : 'Составляю план…',
    lastStep: 'plan',
  });
  try {
    const r = await api.plan(history(id), feedback, model(), signal);
    if (signal.aborted) return;
    S().addMessage(id, { role: 'assistant', kind: 'plan', content: r.intro, plan: r.steps });
    S().patchTask(id, {
      status: 'awaiting_user',
      checkpoint: 'plan',
      pendingQuestions: 1,
      plan: r.steps.map((title) => ({ title, done: false })),
      preview: `Подтвердите план из ${r.steps.length} шагов`,
    });
  } catch (e) {
    fail(id, 'plan', e);
  } finally {
    end(id, signal);
  }
}

/**
 * Ответ модели потоком. `stay` — ответ на реплику («Добрый вечер», «спасибо») в уже решённом
 * или проверяемом обращении: карточка остаётся на месте, как и её статус.
 */
export async function run(id: string, mode: StreamMode, stay = false): Promise<void> {
  const t = task(id);
  if (!t) return;
  const signal = begin(id);
  // для ответа на реплику посреди работы: после ответа всё возвращается как было (шаг, вопрос, кнопки)
  const before = {
    status: t.status,
    checkpoint: t.checkpoint,
    pendingQuestions: t.pendingQuestions,
    preview: t.preview,
    replyOptions: t.replyOptions ?? null,
    askText: t.askText ?? null,
    reviewButtons: t.reviewButtons ?? null,
  };
  if (!stay) await moveTo(id, 'working');
  const plan = mode === 'execute' ? (t.plan ?? []).map((p) => p.title) : [];
  S().patchTask(id, {
    status: 'awaiting_ai',
    checkpoint: null,
    pendingQuestions: 0,
    errorMessage: null,
    preview: mode === 'execute' ? 'Выполняю план…' : 'Пишу ответ…',
    lastStep: mode,
    replyOptions: null,
    askText: null,
    reviewButtons: null,
    plan: mode === 'execute' ? (t.plan ?? []).map((p) => ({ ...p, done: false })) : t.plan,
  });
  S().setLive(id, { text: '', model: null });

  let usedModel: string | null = null;
  let partial = '';
  let outcome: AnswerOutcome | null = null;
  try {
    const text = await streamReply(
      {
        messages: mode === 'answer' ? answerHistory(S().messages[id] ?? []) : history(id),
        mode,
        plan,
        model: model(),
        // реплика «спасибо» в решённом обращении — этап не меняется, оценка не нужна
        assess: !stay,
      },
      {
        onOutcome: (o) => {
          outcome = o;
        },
        onMeta: (m) => {
          usedModel = m.model;
          S().setLive(id, { text: '', model: m.model });
        },
        onToken: (full) => {
          partial = full;
          // ИИ не передаёт обращение сам — фразы «передал специалисту» не показываем (ТЗ v4.23)
          S().setLive(id, { text: honestHandoff(full), model: usedModel });
        },
        onStep: (n) => {
          const cur = task(id);
          if (!cur?.plan) return;
          S().patchTask(id, {
            plan: cur.plan.map((p, i) => ({ ...p, done: i < n - 1 })),
            preview: `Шаг ${n} из ${cur.plan.length}: ${cur.plan[n - 1]?.title ?? ''}`,
          });
        },
      },
      signal,
    );
    S().setLive(id, null);
    const faked = claimsHandoff(text);
    const clean = honestHandoff(text);
    // вопрос «Передать специалисту?» убран — оценка по исходному тексту больше не подходит
    if (
      faked &&
      outcome &&
      /передать|передам|специалист/i.test((outcome as AnswerOutcome).question)
    )
      outcome = null;
    S().addMessage(id, { role: 'assistant', content: clean, model: usedModel });
    end(id, signal);
    if (stay) {
      S().patchTask(id, before);
      return;
    }
    const cur = task(id);
    if (cur?.plan && mode === 'execute')
      S().patchTask(id, { plan: cur.plan.map((p) => ({ ...p, done: true })) });
    await finish(id, clean, outcome);
  } catch (e) {
    end(id, signal);
    if ((e as Error).name === 'AbortError') {
      S().setLive(id, null);
      if (partial.trim() && task(id))
        S().addMessage(id, {
          role: 'assistant',
          content: honestHandoff(partial),
          model: usedModel,
          stopped: true,
        });
      // ответ на реплику остановили — обращение остаётся таким, каким было
      if (stay && task(id)?.status === 'awaiting_ai') S().patchTask(id, before);
      return;
    }
    fail(id, mode, e);
  }
}

/** Вежливый вопрос в конце ответа — не встречный вопрос: «Помогло?», «Могу ещё чем-то помочь?». */
const COURTESY_QUESTION =
  /(^|[.!…]\s+)(это |ну как, )?(помогло|получилось|сработало|удалось|понятно|ясно|всё понятно|всё получилось|остались (ли )?(ещё )?вопросы|есть (ли )?(ещё )?вопросы|могу (ли )?(я )?(ещё )?(чем-(то|нибудь) )?помочь|нужна (ли )?(ещё )?(какая-(то|нибудь) )?помощь|что-(то|нибудь) ещё|чем (ещё )?(могу )?помочь)[^.!?\n]*\?\s*[)»"]*\s*$/i;
/** Просьба к человеку что-то сообщить — встречный вопрос, даже без «?» («уточните, для кого…»). */
const ASKS_USER = new RegExp(
  '(?<![а-яё])(уточните|сообщите|пришлите|укажите|выберите|уточни|сообщи|пришли|укажи|выбери)(?![а-яё])|' +
    '(^|[.!:]\\s+|\\n)(напишите|расскажите|опишите|подскажите|напиши|расскажи|опиши)(?![а-яё])',
  'i',
);

/**
 * ЗАПАСНАЯ оценка (если сервер не прислал outcome): просит ли помощник данные у человека.
 * Та же логика, что на сервере (apps/api/src/llm/mock.ts → asksForInfo).
 */
export function asksForInfo(text: string): boolean {
  const full = text.replace(/```[\s\S]*?```/g, '').trim();
  if (!full) return false;
  const plain = full.replace(COURTESY_QUESTION, '$1').trim();
  if (plain !== full && !ASKS_USER.test(plain)) return false;
  const items = plain.split('\n').filter((l) => /^\s*(\d+[.)]|[-*•])\s/.test(l));
  if (items.length) return items.every((l) => /\?\s*$/.test(l));
  if (plain.length > 900) return false;
  const last =
    plain
      .split(/\n+/)
      .filter((l) => l.trim())
      .at(-1) ?? '';
  return /\?\s*[)»"]*\s*$/.test(last) || ASKS_USER.test(plain);
}

/**
 * Куда идёт карточка после ответа (ТЗ v4.13) — по оценке ответа, а не по знаку «?»:
 * - need_info — помощник просит данные → «Уточнение», кнопки-варианты;
 * - in_progress — сделана часть, ждём результат → «В работе», кнопки «получилось / нет»;
 * - final — готово → «Проверка» с кнопками по смыслу; в «Готово» — только после подтверждения человеком.
 */
async function finish(id: string, text: string, outcome: AnswerOutcome | null): Promise<void> {
  const t = task(id);
  if (!t) return;
  const o: AnswerOutcome = outcome ?? {
    state: asksForInfo(text) ? 'need_info' : 'final',
    question: '',
    buttons: [],
  };
  // человек попросил «ответь без уточнений» — помощник не должен снова спрашивать: это уже результат
  const skipped = lastUserText(id) === SKIP_ALL;
  if (o.state !== 'final' && !skipped) {
    await moveTo(id, o.state === 'need_info' ? 'clarify' : 'working');
    S().patchTask(id, {
      status: 'awaiting_user',
      checkpoint: 'ask',
      pendingQuestions: 1,
      // ждём результат действия — его человек пишет сам, без быстрых ответов (ТЗ v4.23)
      replyOptions: o.state === 'in_progress' ? null : o.buttons.length ? o.buttons : null,
      askText: o.question || null,
      reviewButtons: null,
      preview: o.question || short(text),
    });
    return;
  }
  await moveTo(id, 'review');
  S().patchTask(id, {
    status: 'awaiting_user',
    checkpoint: 'review',
    pendingQuestions: 1,
    replyOptions: null,
    askText: null,
    reviewButtons:
      o.state === 'final' && o.buttons.length === 2 ? [o.buttons[0]!, o.buttons[1]!] : null,
    preview: short(text),
  });
}

/**
 * Пользователь сам перенёс обращение в «Готово» (ТЗ v4.23): «Решено самостоятельно». Заявка у
 * специалиста закрывается («пользователь решил сам»). Метка снимается, когда обращение возобновят.
 */
export async function selfSolve(id: string): Promise<void> {
  const t = task(id);
  if (!t) return;
  controllers.get(id)?.abort();
  S().setLive(id, null);
  if (t.escalation && t.escalation.status !== 'resolved')
    setEscalation(id, 'resolved', {
      closed: { by: 'user', self: true, at: now() },
      closeAt: null,
      remindAt: null,
    });
  await moveTo(id, 'done', false);
  S().addMessage(id, {
    role: 'system',
    content:
      'Вы отметили вопрос как решённый самостоятельно. Если проблема вернётся — просто напишите здесь.',
  });
  S().patchTask(id, {
    status: 'idle',
    checkpoint: null,
    pendingQuestions: 0,
    errorMessage: null,
    offer: null,
    selfSolved: true,
    preview: 'Решено самостоятельно',
  });
}

export async function accept(id: string): Promise<void> {
  const t = task(id);
  if (!t) return;
  // обращения так и не было — просто закрываем, без «Вопрос закрыт»
  if (t.triage?.meaningful === false && !t.escalation) return close(id);
  controllers.get(id)?.abort();
  if (t.escalation && t.escalation.status !== 'resolved')
    setEscalation(id, 'resolved', {
      closed: { by: 'user', at: now() },
      closeAt: null,
      remindAt: null,
    });
  await moveTo(id, 'done', false);
  const problem = isProblemTask(t);
  S().patchTask(id, {
    status: 'idle',
    checkpoint: null,
    pendingQuestions: 0,
    errorMessage: null,
    ...(problem ? { preview: 'Вопрос закрыт' } : {}),
  });
}

export async function approvePlan(id: string): Promise<void> {
  S().addMessage(id, { role: 'user', content: 'План подходит, выполняй.' });
  return run(id, 'execute');
}

/**
 * Доработка: пользователь описал, что изменить. Сообщение показываем как есть — без приставок;
 * что это просьба доработать, модель понимает из переписки.
 */
export async function rework(id: string, note: string): Promise<void> {
  const t = task(id);
  if (t?.triage?.mode === 'steps' || t?.escalation) return notSolved(id, note.trim());
  S().addMessage(id, { role: 'user', content: note.trim() });
  return run(id, 'answer');
}

/**
 * Просьба «Срочно» от человека (ТЗ v4.16) или её снятие. На работу помощника и очередь специалиста
 * не влияет — специалист видит её как просьбу с причиной (уходит вместе с заявкой).
 */
export function setUrgent(id: string, reason: string | null): void {
  const text = reason?.trim().slice(0, 300) ?? '';
  S().patchTask(id, {
    urgentRequest: text
      ? { reason: maskPersonalData(text).text, at: new Date().toISOString() }
      : null,
  });
}

/** Текст «ответь без уточнений» — по нему помощник понимает, что спрашивать больше нельзя. */
export const SKIP_ALL = 'Ответь без уточнений — с тем, что уже известно.';
/** Ответ на пропущенный вопрос. */
export const SKIP_ONE = 'Пропускаю этот вопрос';

const lastUserText = (id: string) =>
  [...(S().messages[id] ?? [])].reverse().find((m) => m.role === 'user')?.content ?? '';

/** «Пропустить вопрос» в панели вопросов: следующий вопрос, а после последнего — дальше. */
export function skipQuestion(id: string): Promise<void> {
  return reply(id, SKIP_ONE);
}

/**
 * «Ответить без уточнений» (ТЗ v4.14): вопросы кажутся лишними — помощник отвечает с тем, что есть,
 * и называет свои допущения. Работает и для уточнения после разбора, и для встречного вопроса.
 */
export async function answerWithoutQuestions(id: string): Promise<void> {
  const t = task(id);
  if (!t || t.status !== 'awaiting_user') return;
  if (t.checkpoint !== 'questions' && t.checkpoint !== 'ask') return;
  S().addMessage(id, { role: 'user', content: SKIP_ALL });
  S().patchTask(id, {
    checkpoint: null,
    questions: null,
    pendingQuestions: 0,
    replyOptions: null,
    askText: null,
  });
  if (t.checkpoint === 'questions') return proceed(id);
  return run(id, 'answer');
}

/** Реплика без сути: приветствие, «спасибо», «ответьте», «вы тут?». */
const CHATTER =
  /^(добр(ый|ое|ого)\s+(день|вечер|утро|утра|дня|вечера)|здравствуй(те)?|привет(ствую)?|hi|hello|спасибо( большое)?|благодарю|ок(ей)?|ok|понял[аи]?|ясно|хорошо|ответьте|ответь|вы тут|ты тут|есть кто|алло|ау)[\s.!?,)]*$/i;

const YES =
  /^(да|ок|окей|ok|подходит|согласен|согласна|верно|давай|начинай|поехали|выполняй|\+)[\s.!,]*$/i;
/** Ответ на «Передать специалисту?» словами. */
const OFFER_YES =
  /^(да|давай(те)?|ок|окей|передай(те)?|передавай(те)?|хорошо|согласен|согласна)(?![а-яё])[\s\S]{0,40}$/i;
const OFFER_NO =
  /^(нет|не надо|не нужно|не стоит|сам[аи]?|продолжим|продолжай(те)?)(?![а-яё])[\s.!,]*$/i;
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[.!\s]+/g, ' ')
    .trim();
/** «Решено» — только короткой репликой целиком: «решено частично» или «работает, но медленно» — не решено. */
const SOLVED =
  /^(да,?\s*)?(решено|решилось|всё решилось|заработало|помогло|всё работает|все работает|получилось|всё получилось|спасибо,?\s*помогло)[\s.!,)]*$/i;

/**
 * Ответ пользователя — из карточки (быстрый ответ) или из чата.
 * Что он значит, зависит от контрольной точки.
 */
export async function reply(id: string, text: string): Promise<void> {
  const t = task(id);
  const clean = text.trim();
  if (!t || !clean) return;

  if (t.status === 'with_support') {
    // Пишет специалисту — ИИ не вмешивается
    S().addMessage(id, { role: 'user', content: clean });
    return;
  }

  if (t.checkpoint === 'faq') {
    S().addMessage(id, { role: 'user', content: clean });
    S().patchTask(id, { checkpoint: null });
    // ИИ снова доступен — разбираем как обычно; иначе — заново подбираем частые вопросы
    await ensureStatus();
    return aiAvailable() ? start(id) : offlineStart(id, true);
  }

  if (
    t.checkpoint === 'describe' ||
    (t.checkpoint === 'questions' && t.triage?.meaningful === false)
  ) {
    // обращения ещё не было: новое сообщение разбираем заново вместе с прошлыми
    S().addMessage(id, { role: 'user', content: clean });
    S().patchTask(id, { checkpoint: null, questions: null, pendingQuestions: 0 });
    return start(id);
  }

  // Разговор посреди работы над обращением («кто ты?», «спасибо», «вы тут?»): просто ответить —
  // шаг, вопрос уточнения, встречный вопрос или проверка остаются на месте (ТЗ v4.15)
  if (
    t.status === 'awaiting_user' &&
    (t.checkpoint === 'step' ||
      t.checkpoint === 'questions' ||
      t.checkpoint === 'ask' ||
      t.checkpoint === 'plan' ||
      t.checkpoint === 'review') &&
    isChitChat(clean)
  ) {
    S().addMessage(id, { role: 'user', content: clean });
    return run(id, 'answer', true);
  }

  if (t.checkpoint === 'questions') {
    const qs = t.questions ?? [];
    const idx = Math.max(0, qs.length - t.pendingQuestions);
    const q = qs[idx];
    S().addMessage(id, { role: 'user', content: clean, answerTo: q?.text });
    const left = Math.max(0, t.pendingQuestions - 1);
    if (left > 0 && qs[idx + 1]) {
      S().patchTask(id, { pendingQuestions: left, preview: qs[idx + 1]!.text });
      return;
    }
    S().patchTask(id, { pendingQuestions: 0, checkpoint: null, questions: null });
    return proceed(id);
  }

  if (t.checkpoint === 'ask') {
    // ответ на встречный вопрос помощника (кнопкой или своими словами) — продолжаем ответ
    S().addMessage(id, { role: 'user', content: clean });
    S().patchTask(id, { checkpoint: null, replyOptions: null, askText: null, pendingQuestions: 0 });
    return run(id, 'answer');
  }

  if (t.checkpoint === 'step') return stepAnswer(id, clean);

  if (t.checkpoint === 'offer') {
    const want = t.offer?.continueLabel ?? 'Продолжить с ИИ';
    if (norm(clean) === norm('Передать специалисту') || OFFER_YES.test(clean))
      return acceptOffer(id);
    if (norm(clean) === norm(want) || OFFER_NO.test(clean)) return declineOffer(id);
    // своими словами — значит, продолжаем разговор
    return declineOffer(id, clean);
  }

  if (t.checkpoint === 'plan') {
    if (YES.test(clean)) return approvePlan(id);
    S().addMessage(id, { role: 'user', content: clean });
    return makePlan(id, clean);
  }

  if (t.checkpoint === 'review' && SOLVED.test(clean) && !/не\s/i.test(clean)) return solved(id);

  // «Добрый вечер», «спасибо» в решённом или проверяемом обращении — просто ответить, не переоткрывая
  if ((t.column === 'done' || t.checkpoint === 'review') && CHATTER.test(clean)) {
    S().addMessage(id, { role: 'user', content: clean });
    return run(id, 'answer', true);
  }

  if (t.column === 'draft' && t.status !== 'scheduled') {
    S().addMessage(id, { role: 'user', content: clean });
    return start(id);
  }

  return rework(id, clean);
}

export async function regenerate(id: string): Promise<void> {
  const msgs = S().messages[id] ?? [];
  const last = [...msgs]
    .reverse()
    .find((m) => m.role === 'assistant' && (m.kind ?? 'text') === 'text');
  if (last) S().removeMessage(id, last.id);
  const t = task(id);
  // обращения ещё нет — заново разбираем и отвечаем по-человечески, а не пишем «ответ на задачу»
  if (t?.checkpoint === 'describe') {
    S().patchTask(id, { checkpoint: null });
    return start(id);
  }
  return run(id, t?.lastStep === 'execute' ? 'execute' : 'answer');
}

export function stop(id: string) {
  controllers.get(id)?.abort();
  const t = task(id);
  if (!t) return;
  // решённое обращение (ответ на реплику) не переоткрываем — run вернёт прежний статус
  if (t.column === 'done') return;
  // остановили разбор, вопросы или шаги (текст ещё не пишется): в «Проверку» переносить нечего —
  // карточка остаётся на месте, можно «Повторить» или дописать сообщение
  if (!S().live[id]) {
    const message = 'Остановлено. Можно нажать «Повторить» или дописать сообщение.';
    S().patchTask(id, {
      status: 'error',
      errorMessage: message,
      checkpoint: null,
      preview: 'Остановлено — откройте и нажмите «Повторить»',
    });
    S().addMessage(id, { role: 'assistant', kind: 'error', content: message });
    return;
  }
  S().patchTask(id, {
    status: 'awaiting_user',
    checkpoint: 'review',
    pendingQuestions: 1,
    preview: 'Остановлено. Принять или доработать?',
  });
  if (t.column !== 'review') S().placeTask(id, 'review', 0);
}

export async function retry(id: string): Promise<void> {
  const t = task(id);
  if (!t) return;
  switch (t.lastStep) {
    case 'questions':
      return askQuestions(id);
    case 'plan':
      return makePlan(id);
    case 'steps':
      return solve(id);
    case 'handoff':
      return escalate(id);
    case 'step-reply': {
      // ответ на шаг прервали — просто ждём его снова
      const plan = t.plan ?? [];
      if (plan[t.stepIndex]) {
        S().patchTask(id, {
          status: 'awaiting_user',
          checkpoint: 'step',
          pendingQuestions: 1,
          errorMessage: null,
          preview: stepPreview(plan, t.stepIndex),
        });
        return;
      }
      return run(id, 'answer');
    }
    case 'answer':
    case 'execute':
      return run(id, t.lastStep);
    default:
      return start(id);
  }
}

/**
 * После перезагрузки страницы ответ, который писался, уже не придёт: такие обращения
 * не должны «думать» вечно — показываем ошибку с кнопкой «Повторить».
 */
export function recoverInterrupted() {
  for (const t of Object.values(S().tasks)) {
    if (t.status !== 'awaiting_ai' || isRunning(t.id)) continue;
    const message = 'Ответ прервался: страница была перезагружена. Нажмите «Повторить».';
    S().patchTask(t.id, {
      status: 'error',
      errorMessage: message,
      checkpoint: null,
      preview: 'Ответ прервался — откройте и нажмите «Повторить»',
    });
    S().addMessage(t.id, { role: 'assistant', kind: 'error', content: message });
  }
}

export function remove(id: string) {
  controllers.get(id)?.abort();
  S().setLive(id, null);
  S().deleteTask(id);
}
