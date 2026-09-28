import type { Question, SolutionStep, Triage, Urgency } from './llm';

/**
 * Доменная модель (ТЗ, п. 2, 3, 5, 6, 11). Общая для фронтенда и бэкенда.
 */

/** Столбцы доски в порядке движения карточки: слева направо (mobile — сверху вниз). */
export const COLUMNS = ['draft', 'clarify', 'working', 'review', 'done'] as const;
export type ColumnId = (typeof COLUMNS)[number];

export const COLUMN_LABELS: Record<ColumnId, string> = {
  draft: 'Черновик',
  clarify: 'Уточнение',
  working: 'В работе',
  review: 'Проверка',
  done: 'Готово',
};

export const COLUMN_HINTS: Record<ColumnId, string> = {
  draft: 'Новые обращения и запланированные',
  clarify: 'ИИ разбирает обращение и уточняет только нужное',
  working: 'Решаем по шагам или у специалиста',
  review: 'Проблема решена?',
  done: 'Решённые обращения',
};

/** Порядковый номер столбца: 1…5 — используется для токенов `--col-N`. */
export const columnIndex = (c: ColumnId): 1 | 2 | 3 | 4 | 5 =>
  (COLUMNS.indexOf(c) + 1) as 1 | 2 | 3 | 4 | 5;

export type TaskStructure = 'clear' | 'loose';
export type TaskDifficulty = 'easy' | 'hard';

/** A — чёткая лёгкая, B — чёткая трудная, C — размытая лёгкая, D — размытая трудная. */
export type TaskKind = 'A' | 'B' | 'C' | 'D';

export function taskKind(structure: TaskStructure, difficulty: TaskDifficulty): TaskKind {
  if (structure === 'clear') return difficulty === 'easy' ? 'A' : 'B';
  return difficulty === 'easy' ? 'C' : 'D';
}

/** Индикатор сложности на бейдже: 1–3 деления. */
export const KIND_LEVEL: Record<TaskKind, 1 | 2 | 3> = { A: 1, B: 2, C: 2, D: 3 };

/** Сколько контрольных точек (остановок) проходит задача. D — от 2 до 3. */
export const KIND_CHECKPOINTS: Record<TaskKind, { min: number; max: number }> = {
  A: { min: 0, max: 0 },
  B: { min: 1, max: 1 },
  C: { min: 1, max: 1 },
  D: { min: 2, max: 3 },
};

export const STRUCTURE_LABELS: Record<TaskStructure, string> = {
  clear: 'Чёткая',
  loose: 'Размытая',
};

export const DIFFICULTY_LABELS: Record<TaskDifficulty, string> = {
  easy: 'лёгкая',
  hard: 'трудная',
};

/** Ответ классификатора (отдельный быстрый вызов модели). */
export interface Classification {
  structure: TaskStructure;
  difficulty: TaskDifficulty;
  reason: string;
  estimated_seconds: number;
}

export type TaskStatus =
  'idle' | 'awaiting_ai' | 'awaiting_user' | 'with_support' | 'scheduled' | 'error';

export const STATUS_LABELS: Record<TaskStatus, string> = {
  idle: 'Черновик',
  awaiting_ai: 'Ожидает ИИ',
  awaiting_user: 'Нужен ваш ответ',
  with_support: 'У специалиста',
  scheduled: 'Запланирована',
  error: 'Ошибка',
};

/** Адресат задачи: ИИ или живой оператор поддержки (ТЗ, п. 6). */
export type Recipient = 'ai' | 'support';

/** Цвет метки раздела — только из палитры. */
export const SECTION_COLORS = ['clay', 'kraft', 'stone', 'slate'] as const;
export type SectionColor = (typeof SECTION_COLORS)[number];

/** «Общее» — все задачи. Остальные разделы — подборки из него по смыслу (ТЗ v3.3, п. 5). */
export const GENERAL_SECTION_ID = 'general';

/**
 * Как пополняется раздел (ТЗ v4.6, п. 5): `auto` — ИИ раскладывает обращения по смыслу
 * (по названию и описанию); `manual` — индивидуальный раздел, обращения выбирает сам человек.
 */
export type SectionMode = 'auto' | 'manual';

export interface Section {
  id: string;
  name: string;
  /** Какие задачи сюда попадают — по этому описанию ИИ раскладывает задачи. */
  description?: string;
  color: SectionColor;
  sharedContext: boolean;
  /** Нет — `auto` (разделы, созданные до v4.6). */
  mode?: SectionMode;
}

export const isManualSection = (s: Pick<Section, 'mode'>) => s.mode === 'manual';

/** Этап плана трудной задачи: в столбце «В работе» видны галочки (ТЗ, п. 3). */
export interface PlanStep {
  title: string;
  done: boolean;
  /** Что сделать пользователю (для пошагового решения). */
  instruction?: string;
  /** Итог шага по словам пользователя. */
  result?: 'ok' | 'fail';
  /** Вопрос о результате шага и ответы по смыслу («Почта открылась?» — «Да, открылась» / «Нет»). */
  check?: string;
  yes?: string;
  no?: string;
}

export const URGENCY_LABELS: Record<Urgency, string> = {
  critical: 'Срочно',
  high: 'Высокая',
  normal: 'Обычная',
  low: 'Низкая',
};

export const URGENCY_ORDER: Record<Urgency, number> = { critical: 0, high: 1, normal: 2, low: 3 };

/** Сводка для специалиста (ТЗ v2, п. 13.6): пользователь не пересказывает ситуацию заново. */
export interface Handoff {
  original: string;
  qa: { q: string; a: string }[];
  hypothesis: string;
  actions: string[];
  result: string;
  notes: string;
  service: string;
  urgency: Urgency;
}

export type EscalationStatus = 'new' | 'in_progress' | 'answered' | 'resolved';

export const ESCALATION_LABELS: Record<EscalationStatus, string> = {
  new: 'Новые',
  in_progress: 'В работе',
  answered: 'Ждёт пользователя',
  resolved: 'Решено',
};

export interface Escalation {
  status: EscalationStatus;
  handoff: Handoff;
  /** Почему передали: выбор пользователя, «нельзя решить самостоятельно», два неудачных сценария. */
  reason: string;
  createdAt: string;
  updatedAt: string;
  /** Ревизия статуса: растёт при каждой смене — так владелец и специалист не перетирают друг друга. */
  rev?: number;
}

/** Переход задачи назад по доске = «доработать» (ТЗ, п. 3). */
export const isBackwardMove = (from: ColumnId, to: ColumnId): boolean =>
  COLUMNS.indexOf(to) < COLUMNS.indexOf(from);

/** Что ждёт ответа пользователя на контрольной точке. */
/** describe — обращения пока нет («F», «привет», «ничего не случилось»): ждём, что человек расскажет. */
/** faq — ИИ недоступен, человек выбирает частый вопрос или передаёт специалисту. */
/** ask — помощник ждёт данные или результат действия (ТЗ v4.13): кнопки-ответы в `replyOptions`. */
export type Checkpoint = 'describe' | 'faq' | 'questions' | 'plan' | 'step' | 'review' | 'ask';

/** Шаг сценария — чтобы «Повторить» после ошибки запускал именно его. */
export type AgentStep =
  'classify' | 'questions' | 'plan' | 'answer' | 'execute' | 'steps' | 'handoff';

export interface Task {
  id: string;
  /**
   * Разделы, в которых видна задача (кроме «Общего» — там видны все).
   * Раскладывает ИИ по смыслу; пользователь может добавить или убрать вручную.
   */
  sections: string[];
  /** Разделы, из которых пользователь убрал задачу, — ИИ её туда больше не добавляет. */
  hiddenFrom: string[];
  title: string;
  structure: TaskStructure;
  difficulty: TaskDifficulty;
  column: ColumnId;
  status: TaskStatus;
  /** ISO 8601 в UTC; `null`, если не запланирована. */
  scheduledAt: string | null;
  recipient: Recipient;
  /** Сколько вопросов контрольной точки ждут ответа пользователя (0 — нет остановки). */
  pendingQuestions: number;
  /** Этапы плана для трудных задач; `null` — плана нет. */
  plan: PlanStep[] | null;
  /** Короткое превью последнего сообщения для карточки. */
  preview: string | null;
  /** Текст ошибки для состояния `error`. */
  errorMessage: string | null;
  /** Текущая контрольная точка (null — остановки нет). */
  checkpoint: Checkpoint | null;
  /** Вопросы уточнения; текущий — `questions[questions.length - pendingQuestions]`. */
  questions: Question[] | null;
  /** Последний шаг сценария (для «Повторить»). */
  lastStep: AgentStep | null;
  /** Оценка времени генерации от классификатора, секунды. */
  estimatedSeconds: number | null;
  /** Пользователь сам менял название — ИИ его больше не трогает. */
  titleEdited: boolean;
  /** Разбор обращения «что произошло» (null — ещё не разобрано). */
  triage: Triage | null;
  urgency: Urgency;
  /** Индекс текущего шага пошагового решения. */
  stepIndex: number;
  /** Сколько сценариев решения уже попробовали. */
  attempts: number;
  /** Передача специалисту (null — не передавали). */
  escalation: Escalation | null;
  /** Кнопки-ответы по смыслу для точки `ask` («Для себя», «Для ребёнка»), ТЗ v4.13. */
  replyOptions?: string[] | null;
  /** Главный вопрос помощника для точки `ask` — заголовок панели ответа внизу (ТЗ v4.14). */
  askText?: string | null;
  /** Кнопки проверки по смыслу: [доволен, доработать] — «Да, записался / Не получилось». */
  reviewButtons?: [string, string] | null;
  createdAt: string;
  updatedAt: string;
}

export type MessageRole = 'user' | 'assistant' | 'system';

/** Вид сообщения в чате задачи: обычный текст или блок контрольной точки. */
export type MessageKind =
  | 'text'
  | 'questions'
  | 'plan'
  | 'error'
  | 'triage'
  | 'steps'
  | 'handoff'
  | 'specialist'
  /** ИИ недоступен: выбор из частых вопросов (id тем в `faq`). */
  | 'faq';

export interface Message {
  id: string;
  taskId: string;
  role: MessageRole;
  content: string;
  kind?: MessageKind;
  questions?: Question[];
  plan?: string[];
  triage?: Triage;
  steps?: SolutionStep[];
  handoff?: Handoff;
  /** Ответ пользователя на вопрос уточнения. */
  answerTo?: string;
  /** Частые вопросы, предложенные без ИИ (id тем), — самые похожие первыми. */
  faq?: string[];
  /** Ответ из готовой инструкции, а не от модели. */
  canned?: boolean;
  /** Отчёт пользователя о шаге решения. */
  stepReport?: { title: string; ok: boolean; answer?: string };
  /** Какая модель ответила (null — демо-режим). */
  model?: string | null;
  /** Ответ остановлен пользователем до конца. */
  stopped?: boolean;
  createdAt: string;
}

export interface SectionMemory {
  id: string;
  sectionId: string;
  taskId: string;
  /** 3–7 пунктов: факты, решения, предпочтения пользователя. */
  summary: string[];
  excluded: boolean;
}

/**
 * Обращение-проблема (шаги или специалист): проверка звучит «Решено / Не помогло».
 * Вопрос и заявка (answer, request) — проверяются кнопками по смыслу ответа (ТЗ v4.13).
 */
export function isProblemTask(t: Pick<Task, 'triage' | 'escalation'>): boolean {
  return (
    (!!t.triage && (t.triage.mode === 'steps' || t.triage.mode === 'escalate')) || !!t.escalation
  );
}
