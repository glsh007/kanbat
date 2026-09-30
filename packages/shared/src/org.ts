import type { TriageRoute } from './llm';

/**
 * Профиль организации (ТЗ v4.12, п. 17, шаг 1): роль и характер помощника и «тонкости».
 * Копия типов из apps/api/src/org/profile.ts — держать в синхроне.
 */
export type OrgTemplateId = 'it' | 'gov' | 'games' | 'shop' | 'custom';
export type OrgAddress = 'vy' | 'ty';
export type OrgTone = 'friendly' | 'business' | 'brief';
export type OrgOffTopic = 'answer' | 'decline';

export interface OrgProfile {
  template: OrgTemplateId;
  orgName: string;
  assistantName: string;
  role: string;
  scope: string;
  address: OrgAddress;
  tone: OrgTone;
  offTopic: OrgOffTopic;
  always: string[];
  never: string[];
  signature: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface OrgTemplate {
  id: OrgTemplateId;
  title: string;
  description: string;
  profile: OrgProfile;
}

export interface OrgInfo {
  configured: boolean;
  orgName: string;
  assistantName: string;
}

export interface OrgLimits {
  orgName: number;
  assistantName: number;
  role: number;
  scope: number;
  rule: number;
  rules: number;
  signature: number;
}

/** GET /api/org: администратору — профиль, шаблоны и пределы; остальным — только info. */
export interface OrgState {
  info: OrgInfo;
  profile?: OrgProfile | null;
  templates?: OrgTemplate[];
  limits?: OrgLimits;
}

/**
 * Готовые ответы организации (ТЗ v4.25): ответ на ключевые слова — дословно, если подходит по смыслу.
 * Копия типов из apps/api/src/org/answers.ts — держать в синхроне.
 */
export interface CannedLink {
  label: string;
  url: string;
}

export interface CannedAnswer {
  id: string;
  title: string;
  keywords: string[];
  /** Для ИИ: когда ответ подходит и когда нет. */
  when: string;
  /** Markdown: шаги — нумерованным списком, ссылки — [текст](https://…). */
  body: string;
  links: CannedLink[];
  enabled: boolean;
  shown: number;
  notHelped: number;
  updatedAt: string;
  updatedBy: string;
}

export type CannedDraft = Pick<
  CannedAnswer,
  'title' | 'keywords' | 'when' | 'body' | 'links' | 'enabled'
>;

/** То, что уходит в чат человека. */
export interface CannedView {
  id: string;
  title: string;
  body: string;
  links: CannedLink[];
}

export interface CannedLimits {
  answers: number;
  title: number;
  keywords: number;
  keyword: number;
  when: number;
  body: number;
  links: number;
  linkLabel: number;
  url: number;
}

/** «Проверить»: что увидит человек на эту фразу. */
export interface CannedTest {
  candidates: { id: string; title: string; keyword: string }[];
  chosen: { id: string; title: string } | null;
  reason: string;
  source: 'ai' | 'words' | 'none';
}

/**
 * Жёсткие правила организации (ТЗ v4.26): выполняет сервер, они сильнее мнения модели.
 * Копия типов из apps/api/src/org/rules.ts — держать в синхроне.
 */
export type RuleAction = 'urgent' | 'specialist' | 'hard' | 'service';

export const RULE_ACTION_LABELS: Record<RuleAction, string> = {
  urgent: 'Срочно',
  specialist: 'Сразу к специалисту',
  hard: 'Трудная задача',
  service: 'Сервис',
};

export interface HardRule {
  id: string;
  phrases: string[];
  action: RuleAction;
  service: string;
  note: string;
  enabled: boolean;
}

export interface OrgRules {
  rules: HardRule[];
  forbidden: string[];
  updatedAt?: string;
  updatedBy?: string;
}

export interface RuleLimits {
  rules: number;
  phrases: number;
  phrase: number;
  service: number;
  note: number;
  forbidden: number;
  forbiddenPhrase: number;
}

export interface FiredRule {
  id: string;
  action: RuleAction;
  phrase: string;
  service?: string;
  note?: string;
}

/** «Проверить на фразе»: какие правила сработают и что было бы убрано из ответа ИИ. */
export interface RulesTest {
  fired: FiredRule[];
  censored: boolean;
  cleaned: string;
}

/**
 * Образцы ответов организации (ТЗ v4.27): «вопрос → хороший ответ» — учат помощника, как здесь
 * принято отвечать; человеку дословно не показываются. Копия типов из apps/api/src/org/samples.ts.
 */
export interface AnswerSample {
  id: string;
  question: string;
  answer: string;
  enabled: boolean;
  updatedAt: string;
  updatedBy: string;
  /** Запрещённые фразы из жёстких правил, которые есть в образце. */
  conflicts?: string[];
}

export type SampleDraft = Pick<AnswerSample, 'question' | 'answer' | 'enabled'>;

export interface SampleLimits {
  samples: number;
  question: number;
  answer: number;
  perAnswer: number;
}

/**
 * Проверочные вопросы (ТЗ v4.27): типичные обращения с ожиданиями и прогон на настоящей модели.
 * Копия типов из apps/api/src/checks/checks.ts и checks.service.ts.
 */
export type ExpectRoute = TriageRoute | 'any';

export interface CheckExpect {
  route: ExpectRoute;
  cannedId: string;
  has: string[];
  hasNot: string[];
  urgent: 'any' | 'yes' | 'no';
  service: string;
}

export interface CheckQuestion {
  id: string;
  text: string;
  expect: CheckExpect;
  updatedAt: string;
  updatedBy: string;
}

export type CheckDraft = Pick<CheckQuestion, 'text' | 'expect'>;

export interface CheckLimits {
  questions: number;
  text: number;
  phrases: number;
  phrase: number;
  service: number;
}

export type CheckStatus = 'pass' | 'fail' | 'error' | 'unchecked';

export interface CheckItem {
  label: string;
  ok: boolean;
  detail?: string;
}

export interface CheckResult {
  questionId: string;
  text: string;
  at: string;
  ms: number;
  model: string | null;
  status: CheckStatus;
  route: TriageRoute | null;
  canned: { id: string; title: string } | null;
  reply: string;
  questions: { text: string; options: string[] }[];
  urgency: string | null;
  service: string | null;
  rules: { action: string; phrase: string }[];
  samples: string[];
  items: CheckItem[];
  error?: string;
  mark: 'good' | 'bad' | null;
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

export interface ChecksView {
  questions: CheckQuestion[];
  run: CheckRunInfo | null;
  results: Record<string, CheckResult>;
  limits: CheckLimits;
  routes: Record<TriageRoute, string>;
  provider: 'ollama' | 'openai' | 'mock';
}

/** Разбор ошибок (ТЗ v4.29): ответ, который человек по своему согласию показал администратору. */
export interface ErrorReview {
  id: string;
  question: string;
  answer: string;
  reason: 'not_helped' | 'rework';
  note: string;
  status: 'new' | 'done';
  outcome: 'check' | 'sample' | 'rule' | 'closed' | null;
  createdAt: string;
}
