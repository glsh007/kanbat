import { Logger } from '@nestjs/common';
import { writeFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  BoardBlob,
  ForumCommunity,
  ForumReply,
  ForumThread,
  Storage,
  Ticket,
  User,
  UserRole,
} from './types';

type Data = {
  version: 1;
  meta: Record<string, string>;
  users: Record<string, User>;
  sessions: Record<string, string>;
  boards: Record<string, BoardBlob>;
  tickets: Record<string, Ticket>;
  forumThreads: Record<string, ForumThread>;
  forumReplies: Record<string, ForumReply>;
  forumCommunities: Record<string, ForumCommunity>;
};

const empty = (): Data => ({
  version: 1,
  meta: {},
  users: {},
  sessions: {},
  boards: {},
  tickets: {},
  forumThreads: {},
  forumReplies: {},
  forumCommunities: {},
});

/**
 * Файловое хранилище: всё в памяти, на диск — одним JSON-файлом с задержкой ~0,5 с
 * (атомарно: пишем во временный файл и переименовываем). Для демо и небольшой команды хватает;
 * для сервера в интернете — PostgreSQL с тем же интерфейсом Storage.
 */
export class FileStorage implements Storage {
  private readonly log = new Logger('Storage');
  private data: Data = empty();
  private timer: NodeJS.Timeout | null = null;
  private writing: Promise<void> = Promise.resolve();
  private readonly file: string;

  constructor(private readonly dir: string) {
    this.file = join(dir, 'kanbat.json');
  }

  async init() {
    await mkdir(this.dir, { recursive: true });
    try {
      const raw = await readFile(this.file, 'utf8');
      this.data = { ...empty(), ...(JSON.parse(raw) as Partial<Data>) } as Data;
      this.log.log(`Данные: ${this.file}`);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        // повреждённый файл не затираем — откладываем в сторону
        const aside = `${this.file}.broken-${Date.now()}`;
        await rename(this.file, aside).catch(() => undefined);
        this.log.warn(`Файл данных повреждён, сохранён как ${aside}. Начинаю с пустого.`);
      } else {
        this.log.log(`Новый файл данных: ${this.file}`);
      }
      this.data = empty();
      this.schedule();
    }
    const flush = () => {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
        // при выходе — синхронно, иначе запись не успеет
        writeFileSync(this.file, JSON.stringify(this.data));
      }
    };
    process.once('SIGINT', () => (flush(), process.exit(0)));
    process.once('SIGTERM', () => (flush(), process.exit(0)));
    process.once('beforeExit', flush);
  }

  private schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const snapshot = JSON.stringify(this.data);
      this.writing = this.writing
        .then(async () => {
          const tmp = `${this.file}.tmp`;
          await writeFile(tmp, snapshot, 'utf8');
          await rename(tmp, this.file);
        })
        .catch((e) => this.log.error(`Не удалось сохранить данные: ${(e as Error).message}`));
    }, 500);
  }

  async getMeta(key: string) {
    return this.data.meta[key] ?? null;
  }
  async setMeta(key: string, value: string) {
    this.data.meta[key] = value;
    this.schedule();
  }

  async findUser(name: string, role: UserRole) {
    const key = name.trim().toLowerCase();
    return (
      Object.values(this.data.users).find(
        (u) => u.role === role && u.name.trim().toLowerCase() === key,
      ) ?? null
    );
  }
  async getUser(id: string) {
    return this.data.users[id] ?? null;
  }
  async createUser(user: User) {
    this.data.users[user.id] = user;
    this.schedule();
    return user;
  }
  async updateUser(user: User) {
    this.data.users[user.id] = user;
    this.schedule();
    return user;
  }

  async deleteUser(id: string) {
    delete this.data.users[id];
    delete this.data.boards[id];
    for (const [token, userId] of Object.entries(this.data.sessions))
      if (userId === id) delete this.data.sessions[token];
    for (const [tid, t] of Object.entries(this.data.tickets))
      if (t.ownerId === id) delete this.data.tickets[tid];
    // форум: темы и ответы пользователя удаляются, его голоса снимаются
    for (const t of Object.values(this.data.forumThreads))
      if (t.authorId === id) this.dropThread(t.id);
    for (const r of Object.values(this.data.forumReplies))
      if (r.authorId === id) this.dropReply(r.id);
    for (const t of Object.values(this.data.forumThreads))
      t.voters = t.voters.filter((v) => v !== id);
    for (const r of Object.values(this.data.forumReplies))
      r.voters = r.voters.filter((v) => v !== id);
    // жалобы уходят вместе с аккаунтом; неразобранные предложения сообществ — тоже
    for (const t of Object.values(this.data.forumThreads))
      if (t.reports?.some((x) => x.userId === id))
        t.reports = t.reports.filter((x) => x.userId !== id);
    for (const [cid, c] of Object.entries(this.data.forumCommunities))
      if (c.createdById === id && c.status === 'proposed') delete this.data.forumCommunities[cid];
    this.schedule();
  }

  private dropThread(id: string) {
    delete this.data.forumThreads[id];
    for (const [rid, r] of Object.entries(this.data.forumReplies))
      if (r.threadId === id) delete this.data.forumReplies[rid];
  }

  private dropReply(id: string) {
    const r = this.data.forumReplies[id];
    if (!r) return;
    delete this.data.forumReplies[id];
    const t = this.data.forumThreads[r.threadId];
    if (t) {
      t.replyCount = Math.max(0, t.replyCount - 1);
      if (t.solutionId === id) t.solutionId = null;
    }
  }

  async listThreads() {
    return Object.values(this.data.forumThreads);
  }
  async getThread(id: string) {
    return this.data.forumThreads[id] ?? null;
  }
  async saveThread(thread: ForumThread) {
    this.data.forumThreads[thread.id] = thread;
    this.schedule();
    return thread;
  }
  async deleteThread(id: string) {
    this.dropThread(id);
    this.schedule();
  }
  async listReplies(threadId: string) {
    return Object.values(this.data.forumReplies).filter((r) => r.threadId === threadId);
  }
  async getReply(id: string) {
    return this.data.forumReplies[id] ?? null;
  }
  async saveReply(reply: ForumReply) {
    this.data.forumReplies[reply.id] = reply;
    this.schedule();
    return reply;
  }
  async deleteReply(id: string) {
    this.dropReply(id);
    this.schedule();
  }
  async listAllReplies() {
    return Object.values(this.data.forumReplies);
  }

  async listCommunities() {
    return Object.values(this.data.forumCommunities);
  }
  async saveCommunity(c: ForumCommunity) {
    this.data.forumCommunities[c.id] = c;
    this.schedule();
    return c;
  }

  async createSession(token: string, userId: string) {
    this.data.sessions[token] = userId;
    this.schedule();
  }
  async userIdBySession(token: string) {
    return this.data.sessions[token] ?? null;
  }
  async deleteSession(token: string) {
    delete this.data.sessions[token];
    this.schedule();
  }
  async deleteSessionsOf(userId: string, except?: string) {
    for (const [token, id] of Object.entries(this.data.sessions))
      if (id === userId && token !== except) delete this.data.sessions[token];
    this.schedule();
  }

  async getBoard(userId: string) {
    return this.data.boards[userId] ?? null;
  }
  async putBoard(userId: string, data: string) {
    const prev = this.data.boards[userId];
    const blob: BoardBlob = {
      data,
      rev: (prev?.rev ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    this.data.boards[userId] = blob;
    this.schedule();
    return blob;
  }

  async listTickets() {
    return Object.values(this.data.tickets);
  }
  async ticketsOf(ownerId: string) {
    return Object.values(this.data.tickets).filter((t) => t.ownerId === ownerId);
  }
  async getTicket(id: string) {
    return this.data.tickets[id] ?? null;
  }
  async ticketByTask(ownerId: string, taskId: string) {
    return (
      Object.values(this.data.tickets).find((t) => t.ownerId === ownerId && t.taskId === taskId) ??
      null
    );
  }
  async saveTicket(ticket: Ticket) {
    this.data.tickets[ticket.id] = ticket;
    this.schedule();
    return ticket;
  }
}
