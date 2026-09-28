import {
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
  type StreamMode,
  type Triage,
} from '@app/shared';
import { useBoard } from '@/features/board/store';
import { faqById, rankFaq } from '@/features/faq/faq';
import { aiAvailable, ensureStatus } from './llmStatus';
import { sortTask } from '@/features/sections/sorter';
import { api, streamReply } from '@/lib/api';

/**
 * Оркестратор обращений (ТЗ v2, пп. 2–3, 13).
 *
 * Обращение → «Что произошло» (разбор: суть, сервис, факты, чего не хватает, срочность, режим)
 *   → Уточнение: вопросы ТОЛЬКО по недостающему (0–3; срочное — не больше 1)
 *   → режим:
 *       steps    — шаги по одному: «Получилось / Не получилось / Позвать специалиста»
 *                  → Проверка «Проблема решена?» → нет: новый сценарий; после 2 неудачных — специалист
 *       answer   — ответ текстом (трудный — план ⏸ → выполнение), A без остановок до «Готово»
 *       escalate — сразу сводка и передача специалисту
 *
 * Движение карточки задаёт приложение, а не служебные маркеры модели.
 * Сейчас оркестратор работает в браузере; на этапе отложенной отправки переедет на сервер.
 */

const S = () => useBoard.getState();
const task = (id: string) => S().tasks[id];
const TRANSIT_MS = 380;
const MAX_SCENARIOS = 2;
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
    // это не разбор ИИ, а выбранная тема: нужна, чтобы проверка звучала «Решено / Не помогло»
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
  if (mode === 'escalate') return escalate(id, 'Самостоятельно эту проблему не решить');
  if (mode === 'steps') return solve(id);
  // карточка без разбора (старые данные) — сначала разбор, как у всех (единая инструкция, ТЗ v4.13)
  if (!t.triage) return start(id);
  // вопрос (answer) и заявка (request): ответ по существу; этап после него — по оценке ответа
  return run(id, 'answer');
}

// ——— 3. Решение по шагам ———

/** Новый сценарий решения (attempt — номер попытки). */
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
        ? 'Подбираю другой способ…'
        : urgent(id)
          ? 'Ищу самый быстрый обходной путь…'
          : 'Подбираю шаги решения…',
    lastStep: 'steps',
  });
  try {
    const r = await api.steps(history(id), urgent(id), attempt, model(), signal);
    if (signal.aborted) return;
    end(id, signal);
    if (!r.self_solvable || !r.steps.length)
      return escalate(id, r.escalate_reason || 'Самостоятельно не решить');
    S().addMessage(id, { role: 'assistant', kind: 'steps', content: r.intro, steps: r.steps });
    S().patchTask(id, {
      attempts: attempt,
      stepIndex: 0,
      plan: r.steps.map((s) => ({
        title: s.title,
        instruction: s.instruction,
        check: s.check,
        yes: s.yes,
        no: s.no,
        done: false,
      })),
      status: 'awaiting_user',
      checkpoint: 'step',
      pendingQuestions: 1,
      preview: `Шаг 1 из ${r.steps.length}: ${r.steps[0]!.title}`,
    });
  } catch (e) {
    end(id, signal);
    fail(id, 'steps', e);
  }
}

/** Пользователь выполнил текущий шаг. */
export async function stepDone(id: string): Promise<void> {
  const t = task(id);
  if (!t?.plan || t.checkpoint !== 'step') return;
  const step = t.plan[t.stepIndex];
  if (!step) return;
  const answer = step.yes || 'Получилось';
  S().addMessage(id, {
    role: 'user',
    content: step.check ? `${step.check} — ${answer}` : `${step.title} — ${answer}`,
    stepReport: { title: step.title, ok: true, answer },
  });
  const plan = t.plan.map((p, i) =>
    i === t.stepIndex ? { ...p, done: true, result: 'ok' as const } : p,
  );
  const next = t.stepIndex + 1;
  if (next < plan.length) {
    S().patchTask(id, {
      plan,
      stepIndex: next,
      preview: `Шаг ${next + 1} из ${plan.length}: ${plan[next]!.title}`,
    });
    return;
  }
  S().patchTask(id, { plan, stepIndex: next });
  await moveTo(id, 'review');
  S().patchTask(id, {
    status: 'awaiting_user',
    checkpoint: 'review',
    pendingQuestions: 1,
    preview: 'Все шаги выполнены. Проблема решена?',
  });
}

/** Шаг не помог (или «Не помогло» в Проверке): новый сценарий, после двух — специалист. */
export async function notSolved(id: string, detail?: string): Promise<void> {
  const t = task(id);
  if (!t) return;
  const step = t.checkpoint === 'step' ? t.plan?.[t.stepIndex] : undefined;
  const answer = step?.no || 'Не получилось';
  S().addMessage(id, {
    role: 'user',
    content: step
      ? `${step.check || step.title} — ${answer}${detail ? `. ${detail}` : ''}`
      : `Не помогло${detail ? `: ${detail}` : ''}`,
    stepReport: step
      ? { title: step.title, ok: false, answer: detail ? `${answer}: ${detail}` : answer }
      : undefined,
  });
  if (step && t.plan)
    S().patchTask(id, {
      plan: t.plan.map((p, i) => (i === t.stepIndex ? { ...p, result: 'fail' as const } : p)),
    });
  if (t.escalation) return backToSpecialist(id);
  if (!aiAvailable()) return escalate(id, 'Готовая инструкция не помогла, ИИ недоступен');
  if (t.attempts >= MAX_SCENARIOS)
    return escalate(id, `${MAX_SCENARIOS} сценария решения не помогли`);
  return solve(id);
}

/** Проблема решена. */
export async function solved(id: string): Promise<void> {
  const t = task(id);
  if (!t) return;
  S().addMessage(id, { role: 'user', content: 'Проблема решена' });
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
  const actions = msgs
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
    // повторная передача после «Решено» должна перекрыть старый статус на сервере
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
    recipient: 'support',
    status: 'with_support',
    checkpoint: null,
    preview: 'Передано специалисту — ждёт ответа',
  });
}

/** Пользователь сообщил, что ответ специалиста не помог, — обращение снова у специалиста. */
async function backToSpecialist(id: string): Promise<void> {
  setEscalation(id, 'in_progress');
  await moveTo(id, 'working');
  S().patchTask(id, { status: 'with_support', checkpoint: null, preview: 'Снова у специалиста' });
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
    },
  });
  // специалист считает, что решено, — подтверждает всё равно человек (ТЗ v4.10)
  if (server.status === 'resolved' && t.column !== 'done' && before !== 'resolved') {
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
    S().patchTask(id, { preview: 'Специалист взял обращение в работу' });
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
          S().setLive(id, { text: full, model: usedModel });
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
    S().addMessage(id, { role: 'assistant', content: text, model: usedModel });
    end(id, signal);
    if (stay) {
      S().patchTask(id, before);
      return;
    }
    const cur = task(id);
    if (cur?.plan && mode === 'execute')
      S().patchTask(id, { plan: cur.plan.map((p) => ({ ...p, done: true })) });
    await finish(id, text, outcome);
  } catch (e) {
    end(id, signal);
    if ((e as Error).name === 'AbortError') {
      S().setLive(id, null);
      if (partial.trim() && task(id))
        S().addMessage(id, {
          role: 'assistant',
          content: partial,
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
      replyOptions: o.buttons.length ? o.buttons : null,
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

export async function accept(id: string): Promise<void> {
  const t = task(id);
  if (!t) return;
  // обращения так и не было — просто закрываем, без «Проблема решена»
  if (t.triage?.meaningful === false && !t.escalation) return close(id);
  controllers.get(id)?.abort();
  if (t.escalation && t.escalation.status !== 'resolved') setEscalation(id, 'resolved');
  await moveTo(id, 'done', false);
  const problem = isProblemTask(t);
  S().patchTask(id, {
    status: 'idle',
    checkpoint: null,
    pendingQuestions: 0,
    errorMessage: null,
    ...(problem ? { preview: t.escalation ? 'Решено специалистом' : 'Проблема решена' } : {}),
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
const DONE = /^(готово|сделал[аи]?|выполнил[аи]?|получилось|есть|да|ок|ok|дальше|\+)[\s.!,]*$/i;
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

  if (t.checkpoint === 'step') {
    const cur = t.plan?.[t.stepIndex];
    const same = (a?: string) =>
      !!a && a.toLowerCase().replace(/[.!]/g, '') === clean.toLowerCase().replace(/[.!]/g, '');
    if (same(cur?.yes)) return stepDone(id);
    if (same(cur?.no)) return notSolved(id);
    if (DONE.test(clean) || /^да\b/i.test(clean)) return stepDone(id);
    if (SOLVED.test(clean) && !/не\s/i.test(clean)) return solved(id);
    return notSolved(id, clean);
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
