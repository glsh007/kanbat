/** Мини-форум (ТЗ v4.2, п. 16): контракт API /api/forum/*. */
import type { UserRole } from './server';

/**
 * Значки сообществ — из готового набора (цвета — токены темы, а не свои).
 * Ключ → иконка на сайте (`CommunityIcon`).
 */
export const COMMUNITY_ICONS = [
  'mail',
  'key',
  'wifi',
  'laptop',
  'app',
  'help',
  'printer',
  'phone',
  'shield',
  'users',
  'database',
  'cloud',
  'book',
  'wrench',
  'calendar',
  'globe',
  'camera',
  'card',
] as const;
export type CommunityIconKey = (typeof COMMUNITY_ICONS)[number];

/** Сообщество Бат-Форума (раздел) со статистикой. */
export interface ForumSection {
  id: string;
  /** Короткий адрес: «б/почта». */
  slug: string;
  name: string;
  description: string;
  icon: CommunityIconKey;
  /** Стартовое сообщество (б/разное нельзя архивировать). */
  builtin: boolean;
  threads: number;
  unanswered: number;
  solved: number;
  /** Сколько человек писали в сообществе. */
  members: number;
  activityAt: string | null;
}

/** proposed — предложил пользователь, ждёт специалиста; rejected — отклонено; archived — в архиве. */
export type CommunityStatus = 'active' | 'proposed' | 'rejected' | 'archived';

/** Предложение сообщества (ТЗ v4.7): пользователь предлагает, специалист одобряет. */
export interface CommunityProposal {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: CommunityIconKey;
  status: CommunityStatus;
  /** Для профиля и «Написать» (ТЗ v4.17). */
  authorId?: string;
  /** Метка аватарки автора (ТЗ v4.18). */
  authorAvatar?: string;
  /** Автора можно «Спросить лично» (ТЗ v4.19): не я и принимает личные вопросы. */
  authorAsk?: boolean;
  authorName: string;
  mine: boolean;
  createdAt: string;
  /** Кто решил и когда; причина отказа. */
  decidedByName?: string;
  decidedAt?: string;
  note?: string;
}

/** Поля формы сообщества. */
export interface CommunityDraft {
  slug: string;
  name: string;
  description: string;
  icon: CommunityIconKey;
}

/** best — рекомендации; new — новое; top — лучшее за всё время; unanswered — без ответа. */
export type ForumSort = 'best' | 'new' | 'top' | 'unanswered';

/** Причины жалобы на тему. */
export const REPORT_REASONS = {
  spam: 'Спам или бессмыслица',
  offtopic: 'Не в том сообществе',
  personal: 'Личные данные',
  rude: 'Грубость',
  other: 'Другое',
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;

/** Жалоб, после которых тема скрывается из ленты до решения специалиста. */
export const HIDE_AFTER_REPORTS = 3;

/** Запись журнала модерации — видна всем в теме. */
export interface ModLogEntry {
  at: string;
  byName: string;
  /** Человеческая строка: «перенёс из б/почта», «закрыл тему для ответов». */
  text: string;
}

export interface ForumThreadView {
  /** В рекомендациях: на какое ваше обращение похожа тема. */
  because?: string;
  id: string;
  sectionId: string;
  title: string;
  /** В списке — начало текста, в теме — целиком (Markdown). */
  body: string;
  /** Для профиля и «Написать» (ТЗ v4.17). */
  authorId?: string;
  /** Метка аватарки автора (ТЗ v4.18). */
  authorAvatar?: string;
  /** Автора можно «Спросить лично» (ТЗ v4.19): не я и принимает личные вопросы. */
  authorAsk?: boolean;
  authorName: string;
  authorRole: UserRole;
  mine: boolean;
  score: number;
  voted: boolean;
  pinned: boolean;
  solved: boolean;
  replyCount: number;
  fromRequest: boolean;
  createdAt: string;
  activityAt: string;
  /** Закрыта для ответов (специалистом). */
  locked: boolean;
  /** Скрыта из ленты: много жалоб, ждёт специалиста. */
  hidden: boolean;
  /** Я уже пожаловался. */
  reported: boolean;
  /** Специалисту: число жалоб, ждущих решения. */
  reports?: number;
  /** В теме: журнал модерации. */
  modlog?: ModLogEntry[];
}

export interface ForumReplyView {
  id: string;
  body: string;
  /** Для профиля и «Написать» (ТЗ v4.17). */
  authorId?: string;
  /** Метка аватарки автора (ТЗ v4.18). */
  authorAvatar?: string;
  /** Автора можно «Спросить лично» (ТЗ v4.19): не я и принимает личные вопросы. */
  authorAsk?: boolean;
  authorName: string;
  authorRole: UserRole;
  mine: boolean;
  score: number;
  voted: boolean;
  solution: boolean;
  createdAt: string;
}

export interface ForumThreadPage {
  thread: ForumThreadView;
  replies: ForumReplyView[];
  canModerate: boolean;
}

export interface ForumDraft {
  sectionId: string;
  title: string;
  body: string;
}

/** Подсказка сообщества для новой темы (ТЗ v4.7). */
export interface CommunitySuggestion {
  /** Подходящее сообщество или null — подсказать нечего. */
  sectionId: string | null;
  /** Похоже ли это на вопрос или проблему (false — бессмыслица, болтовня, тест). */
  looksLikeQuestion: boolean;
  /** ai — ответила модель; words — по совпадению слов (ИИ недоступен). */
  source: 'ai' | 'words';
}

/** Очередь «На проверке» для специалиста. */
export interface ForumReviewItem {
  thread: ForumThreadView;
  reports: { reason: ReportReason; note?: string; byName: string; at: string }[];
}

export interface ForumReview {
  reports: ForumReviewItem[];
  proposals: CommunityProposal[];
}

export interface ForumReviewCount {
  reports: number;
  proposals: number;
}
