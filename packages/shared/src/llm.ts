import type { CannedView, RuleAction } from './org';
/**
 * Контракт API /api/llm/* (зеркало — apps/api/src/llm/types.ts).
 */
import type { TaskDifficulty, TaskStructure } from './domain';

export type ChatRole = 'user' | 'assistant';
export type ChatMessage = { role: ChatRole; content: string };

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

/** Срочность обращения: critical — работа заблокирована прямо сейчас / дедлайн в ближайший час. */
export type Urgency = 'critical' | 'high' | 'normal' | 'low';

/** Как обрабатывать: ответить текстом, вести по шагам или сразу передать специалисту. */
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

/** Разбор обращения: «Что произошло, насколько срочно и что нужно сделать». */
/**
 * Путь обращения после разбора (ТЗ v4.27): describe — обращения нет, живой ответ; canned — готовый
 * ответ организации; clarify — уточняющие вопросы; specialist — предложение передать специалисту;
 * answer — ответ ИИ. Выбирает сервер — одно правило и для обращений, и для проверочных вопросов.
 */
export type TriageRoute = 'describe' | 'canned' | 'clarify' | 'specialist' | 'answer';

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
  /** Готовый ответ организации, подошедший по смыслу (ТЗ v4.25); нет — null. */
  canned?: CannedView | null;
  /** Какие жёсткие правила организации сработали (ТЗ v4.26). */
  rules?: { action: RuleAction; phrase: string }[];
  /** Пояснение администратора для «Сразу к специалисту». */
  rule_note?: string;
  /** Что помощник сделает дальше — выбирает сервер (ТЗ v4.27). */
  route?: TriageRoute;
  /** Реплика с предложением передать специалисту. */
  offer?: string;
}

export interface SolutionStep {
  title: string;
  instruction: string;
  /** Короткий вопрос о результате шага: «Почта открылась?» */
  check: string;
  /** Устарело (до v4.21): подписи кнопок «Да / Нет» — теперь пустые, ответ пишет человек. */
  yes: string;
  no: string;
}

/**
 * Ответ человека на шаг своими словами (ТЗ v4.21): живая реакция помощника и итог для кода.
 * done — шаг прошёл, дальше; ask — «сделал», но результат неясен: спросить; failed — не помогло;
 * other — выяснилось другое; solved — проблема ушла целиком; specialist — дальше только специалист
 * (или идей больше нет) — помощник ПРЕДЛАГАЕТ передать, но не передаёт сам.
 */

/** Часть сводки для специалиста, которую формулирует модель. */
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
