/**
 * Данные сервера (зеркало packages/shared/src/server.ts — API собирается в CommonJS
 * и не импортирует TS-исходники shared). Переписка и сводка хранятся как есть (JSON).
 */
export type UserRole = 'employee' | 'specialist';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  timezone?: string;
  /** Цветовая схема интерфейса (ТЗ v4.11): terracotta, sage, sea… Нет — по умолчанию. */
  scheme?: string;
  /**
   * Администратор организации (ТЗ v4.12): специалист, который при последнем входе ввёл код
   * администратора (`ADMIN_CODE`), а не код специалиста. Настраивает помощника под организацию.
   */
  admin?: boolean;
  createdAt: string;
  /** scrypt-хэш пароля личного кабинета (клиенту не отдаётся). Нет — кабинет создан до паролей. */
  passwordHash?: string;
}

export interface BoardBlob {
  data: string;
  rev: number;
  updatedAt: string;
}

export type EscalationStatus = 'new' | 'in_progress' | 'answered' | 'resolved';

export interface Escalation {
  status: EscalationStatus;
  handoff: Record<string, unknown>;
  reason: string;
  createdAt: string;
  updatedAt: string;
  rev?: number;
}

export interface TicketReply {
  id: string;
  text: string;
  authorName: string;
  createdAt: string;
}

export interface Ticket {
  id: string;
  taskId: string;
  ownerId: string;
  ownerName: string;
  title: string;
  escalation: Escalation;
  messages: unknown[];
  replies: TicketReply[];
  /** Какой специалист взял обращение (null — пока никто). */
  takenBy?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

// ——— Форум (ТЗ v4.2, п. 16) ———

export interface ForumThread {
  id: string;
  sectionId: string;
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  /** Кто отметил «Полезно» (id пользователей). */
  voters: string[];
  pinned: boolean;
  /** Ответ-решение (отмечает автор темы или специалист). */
  solutionId: string | null;
  replyCount: number;
  /** Тема из решённого обращения («Поделиться решением»). */
  fromRequest?: boolean;
  createdAt: string;
  /** Последняя активность: новый ответ, решение. */
  activityAt: string;
  /** Закрыта для ответов специалистом (v4.7). */
  locked?: boolean;
  /** Жалобы, ждущие решения специалиста (одна на человека). */
  reports?: ForumReport[];
  /** Журнал модерации: что и кто сделал с темой (последние 20). */
  modlog?: { at: string; byName: string; text: string }[];
}

export type ForumReportReason = 'spam' | 'offtopic' | 'personal' | 'rude' | 'other';

export interface ForumReport {
  userId: string;
  userName: string;
  reason: ForumReportReason;
  note?: string;
  at: string;
}

/** active — видно всем; proposed — предложил сотрудник; rejected — отклонено; archived — в архиве. */
export type CommunityStatus = 'active' | 'proposed' | 'rejected' | 'archived';

/** Сообщество БатФорума (v4.7: хранится в данных, а не в коде). */
export interface ForumCommunity {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  status: CommunityStatus;
  /** Стартовое сообщество. */
  builtin: boolean;
  createdAt: string;
  createdById: string;
  createdByName: string;
  decidedByName?: string;
  decidedAt?: string;
  /** Причина отказа. */
  note?: string;
}

export interface ForumReply {
  id: string;
  threadId: string;
  body: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  voters: string[];
  createdAt: string;
}

/**
 * Хранилище. Сейчас — файл (FileStorage), для сервера в интернете добавится PostgresStorage
 * с тем же интерфейсом; остальной код об этом не знает.
 */
export interface Storage {
  init(): Promise<void>;
  /** Служебные значения (например, сгенерированный код специалиста). */
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;

  findUser(name: string, role: UserRole): Promise<User | null>;
  getUser(id: string): Promise<User | null>;
  createUser(user: User): Promise<User>;
  updateUser(user: User): Promise<User>;
  /** Удалить пользователя со всеми данными: входы, доска, его обращения к специалисту. */
  deleteUser(id: string): Promise<void>;

  createSession(token: string, userId: string): Promise<void>;
  userIdBySession(token: string): Promise<string | null>;
  deleteSession(token: string): Promise<void>;
  /** Выйти на всех устройствах, кроме `except` (после смены пароля). */
  deleteSessionsOf(userId: string, except?: string): Promise<void>;

  getBoard(userId: string): Promise<BoardBlob | null>;
  putBoard(userId: string, data: string): Promise<BoardBlob>;

  listTickets(): Promise<Ticket[]>;
  ticketsOf(ownerId: string): Promise<Ticket[]>;
  getTicket(id: string): Promise<Ticket | null>;
  ticketByTask(ownerId: string, taskId: string): Promise<Ticket | null>;
  saveTicket(ticket: Ticket): Promise<Ticket>;

  listThreads(): Promise<ForumThread[]>;
  getThread(id: string): Promise<ForumThread | null>;
  saveThread(thread: ForumThread): Promise<ForumThread>;
  /** Удалить тему вместе с ответами. */
  deleteThread(id: string): Promise<void>;
  listReplies(threadId: string): Promise<ForumReply[]>;
  getReply(id: string): Promise<ForumReply | null>;
  saveReply(reply: ForumReply): Promise<ForumReply>;
  deleteReply(id: string): Promise<void>;
  /** Все ответы (для лимитов частоты). */
  listAllReplies(): Promise<ForumReply[]>;

  listCommunities(): Promise<ForumCommunity[]>;
  saveCommunity(c: ForumCommunity): Promise<ForumCommunity>;
}

export const STORAGE = Symbol('STORAGE');
