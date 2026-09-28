/**
 * Контракт API /api/llm/*. Зеркало типов из packages/shared/src/llm.ts —
 * API собирается в CommonJS и пока не импортирует TS-исходники shared.
 */
export type ChatRole = 'user' | 'assistant';
export type ChatMessage = { role: ChatRole; content: string };

export type TaskStructure = 'clear' | 'loose';
export type TaskDifficulty = 'easy' | 'hard';

export interface ClassifyResult {
  structure: TaskStructure;
  difficulty: TaskDifficulty;
  reason: string;
  estimated_seconds: number;
  title: string;
}

export interface Question {
  text: string;
  options: string[];
}

export interface QuestionsResult {
  intro: string;
  questions: Question[];
}

export interface PlanResult {
  intro: string;
  steps: string[];
}

export type StreamMode = 'answer' | 'execute';

export interface LlmStatus {
  /** ollama — модель отвечает по-настоящему; mock — демо-режим (Ollama не найдена или нет моделей). */
  provider: 'ollama' | 'openai' | 'mock';
  url: string;
  version: string | null;
  models: string[];
  model: string | null;
  hint: string | null;
  /** Демо-режим сервера: без модели отвечают заготовки (только для разработки). */
  demo?: boolean;
}

/** Проверка скорости ИИ (кнопка «Проверить скорость» в «Настройках»). */
export interface LlmCheck {
  ok: boolean;
  model: string | null;
  /** Время до первого слова (включая загрузку модели в память), мс. */
  firstMs?: number | null;
  totalMs?: number;
  /** Где работает модель: видеокарта, частично или только процессор (null — неизвестно). */
  processor?: { where: 'gpu' | 'cpu' | 'mixed'; gpuShare: number } | null;
  /** Сколько других запросов к модели выполнялось в момент проверки. */
  busy: number;
  error?: string;
}

// ——— Режим поддержки (ТЗ v2, п. 13) ———
export type Urgency = 'critical' | 'high' | 'normal' | 'low';
/** request — оформить, записаться, заказать: собрать данные и объяснить порядок (ТЗ v4.13). */
export type TriageMode = 'answer' | 'request' | 'steps' | 'escalate';

/**
 * Чем закончился ответ помощника (ТЗ v4.13): need_info → «Уточнение», in_progress → «В работе»,
 * final → «Проверка»; buttons — готовые ответы человека по смыслу (для final — [доволен, доработать]).
 */
export type OutcomeState = 'need_info' | 'in_progress' | 'final';
export interface AnswerOutcome {
  state: OutcomeState;
  question: string;
  buttons: string[];
}

export interface Triage {
  /** false — текст не описывает проблему («F», «тест», набор символов): ничего не придумываем, просим описать. */
  meaningful: boolean;
  /** Живой ответ человеку, когда обращения пока нет (meaningful = false); иначе пустая строка. */
  reply: string;
  summary: string;
  service: string;
  facts: string[];
  missing: string[];
  urgency: Urgency;
  urgency_reason: string;
  mode: TriageMode;
  structure: TaskStructure;
  difficulty: TaskDifficulty;
  title: string;
  estimated_seconds: number;
}

export interface SolutionStep {
  title: string;
  instruction: string;
  /** Короткий вопрос о результате шага: «Почта открылась?» */
  check: string;
  /** Ответ «продвинулись»: «Да, открылась». */
  yes: string;
  /** Ответ «не вышло»: «Нет, не открывается». */
  no: string;
}

export interface StepsResult {
  intro: string;
  steps: SolutionStep[];
  self_solvable: boolean;
  escalate_reason: string;
}

export interface HandoffResult {
  hypothesis: string;
  actions: string[];
  result: string;
  notes: string;
}

// ——— Разделы: раскладка задач по смыслу (ТЗ v3.3, п. 5) ———

export interface SectionRef {
  id: string;
  name: string;
  description?: string;
}

export interface SortItem {
  id: string;
  /** Название и суть задачи. */
  text: string;
}

/** Для каждой задачи — id подходящих разделов (может быть пусто). */
export interface SortResult {
  assign: Record<string, string[]>;
}
