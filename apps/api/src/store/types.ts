/**
 * Данные сервера (зеркало packages/shared/src/server.ts — API собирается в CommonJS
 * и не импортирует TS-исходники shared). Переписка и сводка хранятся как есть (JSON).
 */
export type UserRole = 'employee' | 'specialist';

export interface User {
  id: string;
  /** Как обращаться к человеку (отображается везде). */
  name: string;
  /**
   * Ник (ТЗ v4.17): уникальный, латиница, цифры и «_», 3–20 символов, хранится в нижнем регистре.
   * По нему входят и находят друг друга в «Сообщениях». У кабинетов до регистрации — нет, пока не придумают.
   */
  username?: string;
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
  /** Аватарка (ТЗ v4.18): `preset:p3` — готовый рисунок, `photo:<версия>` — своё фото. */
  avatar?: string;
  /** scrypt-хэш фразы для восстановления доступа (клиенту не отдаётся) и когда она создана. */
  recoveryHash?: string;
  recoveryAt?: string;
  /** Удалить аккаунт после года без входа (ТЗ v4.18, включается в «Настройках»). */
  autoDelete?: boolean;
  /** Когда человек последний раз пользовался Канбатом (не чаще раза в час). */
  lastActiveAt?: string;
  /** Не принимать личные вопросы в Бат-общении (ТЗ v4.19). */
  dmOff?: boolean;
  /** Кого человек заблокировал в Бат-общении. */
  dmBlocked?: string[];
}

export interface BoardBlob {
  data: string;
  rev: number;
  updatedAt: string;
}

export type EscalationStatus = 'new' | 'in_progress' | 'answered' | 'resolved';

/** Почему специалист закрыл заявку без решения (ТЗ v4.22). */
export type CloseReason = 'spam' | 'duplicate' | 'wrong' | 'other';

/** Как закрыта заявка (ТЗ v4.22): подтвердил человек, закрылась сама или специалист — без решения. */
export interface EscalationClosed {
  by: 'user' | 'auto' | 'specialist';
  at: string;
  reason?: CloseReason;
  note?: string;
  /** Кто закрыл (специалист). */
  name?: string;
  /** Пользователь перетащил обращение в «Готово»: решил сам (ТЗ v4.23). */
  self?: boolean;
}

export interface Escalation {
  status: EscalationStatus;
  handoff: Record<string, unknown>;
  reason: string;
  createdAt: string;
  updatedAt: string;
  rev?: number;
  closed?: EscalationClosed | null;
  /** Когда заявка закроется сама, если человек не ответит (ставит сервер после ответа специалиста). */
  closeAt?: string | null;
  /** Когда напомнить человеку об автозакрытии. */
  remindAt?: string | null;
}

/** Сроки заявок (ТЗ v4.22): настраивает администратор. */
export interface SupportTimers {
  /** Через сколько часов молчания после ответа специалиста заявка закрывается сама. */
  closeHours: 4 | 24 | 72;
  /** Через сколько часов без ответа принятая заявка возвращается в общую очередь. */
  returnHours: 2 | 4 | 8;
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
  /** Какой специалист принял заявку в работу (null — она в общей очереди). */
  takenBy?: { id: string; name: string } | null;
  /** Когда принята в работу — от этого считается автовозврат (ТЗ v4.22). */
  takenAt?: string | null;
  /** Почему заявка вернулась в общую очередь (ТЗ v4.22). */
  returned?: TicketReturn | null;
  /** Просьба «Срочно» от человека с причиной (ТЗ v4.16) — только просьба, на очередь не влияет. */
  urgent?: { reason: string; at: string } | null;
  /** Переписка удалена по сроку хранения, осталась сводка (ТЗ v4.16). */
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TicketReturn {
  at: string;
  /** timeout — нет ответа N часов; manual — специалист вернул сам; admin — вернул администратор; reopened — человек возобновил закрытую. */
  reason: 'timeout' | 'manual' | 'admin' | 'reopened';
  /** У кого была заявка. */
  from?: string;
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

/** Сообщество Бат-Форума (v4.7: хранится в данных, а не в коде). */
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

// ——— Бат-общение (ТЗ v4.17, по темам форума — v4.19) ———

/** pending — вопрос ждёт ответа; active — переписка. Закрытая переписка стирается, копии — в архивах. */
export type DmStatus = 'pending' | 'active';

export type DmCloseReason =
  'solved' | 'helper_ended' | 'quiet' | 'total' | 'declined' | 'unanswered' | 'blocked' | 'legacy';

export interface DmChat {
  id: string;
  /** Двое участников (id). */
  members: [string, string];
  status: DmStatus;
  /** Кто спросил (спрашивающий); второй — помогающий. */
  requestedBy: string;
  /** Тема Бат-Форума, по которой переписка, и её заголовок на момент вопроса. */
  topicId: string;
  topicTitle: string;
  /** Когда вопрос приняли — от этого момента считается общий срок. */
  acceptedAt?: string;
  /** Когда каждый участник последний раз открыл переписку — для непрочитанных. */
  readAt: Record<string, string>;
  lastAt: string;
  createdAt: string;
}

/** Копия закрытой переписки в кабинете одного человека (видна только ему). */
export interface DmArchiveEntry {
  id: string;
  ownerId: string;
  chatId: string;
  withId: string;
  /** Имя и ник собеседника на момент закрытия (если он удалит аккаунт — останутся). */
  withName: string;
  withUsername: string;
  topicId: string | null;
  topicTitle: string | null;
  role: 'seeker' | 'helper';
  reason: DmCloseReason;
  startedAt: string;
  closedAt: string;
  messages: { id: string; mine: boolean; text: string; createdAt: string }[];
}

export interface DmMessage {
  id: string;
  chatId: string;
  authorId: string;
  text: string;
  createdAt: string;
}

/** Жалоба на переписку: специалист видит только последние сообщения того, на кого пожаловались. */
export interface DmReport {
  id: string;
  chatId: string;
  reporterId: string;
  reporterName: string;
  reportedId: string;
  reportedName: string;
  reason: string;
  messages: { text: string; createdAt: string }[];
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
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
  findByUsername(username: string): Promise<User | null>;
  /** Поиск по нику (начало) и имени (часть) — для «Сообщений». */
  searchUsers(query: string, limit: number): Promise<User[]>;
  getUser(id: string): Promise<User | null>;
  createUser(user: User): Promise<User>;
  updateUser(user: User): Promise<User>;
  /** Удалить пользователя со всеми данными: входы, доска, его обращения к специалисту. */
  deleteUser(id: string): Promise<void>;
  /** Все пользователи (фоновые проверки: автоудаление неактивных). */
  listUsers(): Promise<User[]>;
  /** Фото-аватарка (ТЗ v4.18): байты и тип. */
  getAvatar(userId: string): Promise<{ mime: string; data: string } | null>;
  setAvatar(userId: string, photo: { mime: string; data: string } | null): Promise<void>;

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

  listChatsOf(userId: string): Promise<DmChat[]>;
  getChat(id: string): Promise<DmChat | null>;
  /** Открытая переписка этой пары по этой теме. */
  chatAbout(a: string, b: string, topicId: string): Promise<DmChat | null>;
  saveChat(chat: DmChat): Promise<DmChat>;
  /** Стереть переписку вместе с сообщениями. */
  deleteChat(id: string): Promise<void>;
  /** Все открытые переписки (фоновое закрытие по срокам). */
  listChats(): Promise<DmChat[]>;
  listArchive(ownerId: string): Promise<DmArchiveEntry[]>;
  getArchive(id: string): Promise<DmArchiveEntry | null>;
  saveArchive(entry: DmArchiveEntry): Promise<DmArchiveEntry>;
  deleteArchive(id: string): Promise<void>;
  listDm(chatId: string): Promise<DmMessage[]>;
  saveDm(message: DmMessage): Promise<DmMessage>;
  listDmReports(): Promise<DmReport[]>;
  saveDmReport(report: DmReport): Promise<DmReport>;
  saveCommunity(c: ForumCommunity): Promise<ForumCommunity>;
}

export const STORAGE = Symbol('STORAGE');
