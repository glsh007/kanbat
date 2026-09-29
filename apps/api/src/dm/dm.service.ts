import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { maskPersonalData } from '../common/pii';
import { config } from '../config';
import { RateLimit } from '../forum/limits';
import {
  STORAGE,
  type DmArchiveEntry,
  type DmChat,
  type DmCloseReason,
  type DmMessage,
  type DmReport,
  type Storage,
  type User,
} from '../store/types';

const now = () => new Date().toISOString();
const DAY = 24 * 3_600_000;
const TEXT_MAX = 2000;
const QUESTION_MIN = 5;
const QUESTION_MAX = 1000;
const REASON_MAX = 300;
/** Входящих личных вопросов одному человеку в сутки — бережём тех, кто помогает. */
const INCOMING_PER_DAY = 3;

/** Что видно о человеке другим: имя, ник, роль, аватарка. */
export type PublicProfile = {
  id: string;
  name: string;
  username: string;
  role: User['role'];
  avatar?: string;
};
const profile = (u: User): PublicProfile => ({
  id: u.id,
  name: u.name,
  username: u.username ?? '',
  role: u.role,
  ...(u.avatar ? { avatar: u.avatar } : {}),
});
const gone = (id: string, name = 'Удалённый аккаунт', username = ''): PublicProfile => ({
  id,
  name,
  username,
  role: 'employee',
});

/**
 * Бат-общение (ТЗ v4.19, п. 18). Не мессенджер: личный вопрос по теме Бат-Форума тому, кто в ней
 * отвечал. Кто спросил — спрашивающий, кто принял — помогающий. Переписка закрывается через
 * `DM_QUIET_DAYS` (3) дня тишины или `DM_TOTAL_DAYS` (7) дней с начала, по «Проблема решена»
 * (спрашивающий) или «Больше помочь не могу» (помогающий). Закрытая переписка стирается,
 * у каждого остаётся копия в архиве кабинета. ИИ и специалисты переписку не читают.
 */
@Injectable()
export class DmService implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(STORAGE) private readonly storage: Storage) {}

  /** Защита от ботов: обычный человек столько вопросов за сутки не задаёт. */
  private readonly requests = new RateLimit(30, DAY, 'личных вопросов');
  private readonly incoming = new RateLimit(INCOMING_PER_DAY, DAY, 'вопросов этому человеку');
  private readonly sends = new RateLimit(30, 60_000, 'сообщений');
  private sweep: ReturnType<typeof setInterval> | null = null;

  async onModuleInit() {
    // переписки до v4.19 (без темы) закрываются и уходят в архив обоих
    for (const c of await this.storage.listChats()) if (!c.topicId) await this.close(c, 'legacy');
    await this.expireAll();
    this.sweep = setInterval(() => void this.expireAll(), 10 * 60_000);
    this.sweep.unref?.();
  }

  onModuleDestroy() {
    if (this.sweep) clearInterval(this.sweep);
  }

  // ——— сроки ———

  /** Когда переписка закроется сама. У вопроса без ответа — только срок тишины. */
  deadline(chat: DmChat) {
    const quiet = Date.parse(chat.lastAt) + config.dmQuietDays * DAY;
    if (chat.status === 'pending') return { at: quiet, by: 'quiet' as const };
    const total = Date.parse(chat.acceptedAt ?? chat.createdAt) + config.dmTotalDays * DAY;
    return quiet <= total
      ? { at: quiet, by: 'quiet' as const }
      : { at: total, by: 'total' as const };
  }

  /** Закрыть, если срок вышел. true — закрыта. */
  private async expire(chat: DmChat, at = Date.now()): Promise<boolean> {
    const d = this.deadline(chat);
    if (at < d.at) return false;
    await this.close(chat, chat.status === 'pending' ? 'unanswered' : d.by);
    return true;
  }

  async expireAll(at = Date.now()): Promise<number> {
    let n = 0;
    for (const c of await this.storage.listChats())
      if (c.topicId && (await this.expire(c, at))) n++;
    return n;
  }

  /**
   * Закрыть переписку: копии — в архив (вопрос без ответа или отклонённый — только спрашивающему),
   * сама переписка стирается. Возвращает id архивной копии для `forId`.
   */
  private async close(chat: DmChat, reason: DmCloseReason, forId?: string): Promise<string | null> {
    const list = await this.storage.listDm(chat.id);
    const seeker = chat.requestedBy;
    const owners = reason === 'declined' || reason === 'unanswered' ? [seeker] : [...chat.members];
    let mine: string | null = null;
    for (const owner of owners) {
      const withId = this.other(chat, owner);
      const other = await this.storage.getUser(withId);
      const entry: DmArchiveEntry = {
        id: randomUUID(),
        ownerId: owner,
        chatId: chat.id,
        withId,
        withName: other?.name ?? 'Удалённый аккаунт',
        withUsername: other?.username ?? '',
        topicId: chat.topicId || null,
        topicTitle: chat.topicTitle || null,
        role: owner === seeker ? 'seeker' : 'helper',
        reason,
        startedAt: chat.acceptedAt ?? chat.createdAt,
        closedAt: now(),
        messages: list.map((m) => ({
          id: m.id,
          mine: m.authorId === owner,
          text: m.text,
          createdAt: m.createdAt,
        })),
      };
      await this.storage.saveArchive(entry);
      if (owner === forId) mine = entry.id;
    }
    await this.storage.deleteChat(chat.id);
    return mine;
  }

  // ——— помощники ———

  private other(chat: DmChat, me: string) {
    return chat.members[0] === me ? chat.members[1] : chat.members[0];
  }

  /** Открытая переписка, где я участник; вышел срок — закрывается и «не найдена». */
  private async own(me: User, chatId: string): Promise<DmChat> {
    const chat = await this.storage.getChat(chatId);
    if (!chat || !chat.members.includes(me.id))
      throw new NotFoundException('Переписка закрыта или удалена — посмотрите в архиве');
    if (await this.expire(chat)) throw new NotFoundException('Срок переписки вышел — она в архиве');
    return chat;
  }

  private unreadOf(chat: DmChat, me: string, list: DmMessage[]) {
    const seen = chat.readAt[me] ?? '';
    return list.filter((m) => m.authorId !== me && m.createdAt > seen).length;
  }

  private async card(chat: DmChat, me: string) {
    const otherId = this.other(chat, me);
    const other = await this.storage.getUser(otherId);
    const list = await this.storage.listDm(chat.id);
    const last = list.at(-1);
    const d = this.deadline(chat);
    return {
      id: chat.id,
      with: other ? profile(other) : gone(otherId),
      topic: { id: chat.topicId, title: chat.topicTitle },
      role: chat.requestedBy === me ? ('seeker' as const) : ('helper' as const),
      status: chat.status,
      canWrite: chat.status === 'active',
      last: last
        ? { text: last.text.slice(0, 140), mine: last.authorId === me, at: last.createdAt }
        : null,
      unread: this.unreadOf(chat, me, list),
      lastAt: chat.lastAt,
      closesAt: new Date(d.at).toISOString(),
      closesBy: d.by,
    };
  }

  private blockedBetween(a: User, b: User) {
    return (a.dmBlocked ?? []).includes(b.id) || (b.dmBlocked ?? []).includes(a.id);
  }

  /** Отвечал ли человек в теме (автор темы или ответа). */
  private async answeredIn(threadId: string, userId: string) {
    const t = await this.storage.getThread(threadId);
    if (!t) return false;
    if (t.authorId === userId) return true;
    return (await this.storage.listReplies(threadId)).some((r) => r.authorId === userId);
  }

  /** Спрашивал ли я этого человека по этой теме раньше (есть в моём архиве). */
  private async askedBefore(me: string, withId: string, topicId: string) {
    return (await this.storage.listArchive(me)).some(
      (e) => e.role === 'seeker' && e.withId === withId && e.topicId === topicId,
    );
  }

  // ——— профиль, список, счётчик ———

  async profileOf(me: User, key: string) {
    const u = key.startsWith('@')
      ? await this.storage.findByUsername(key.slice(1).toLowerCase())
      : ((await this.storage.getUser(key)) ??
        (await this.storage.findByUsername(key.toLowerCase())));
    if (!u) throw new NotFoundException('Человек не найден');
    return {
      profile: profile(u),
      me: u.id === me.id,
      open: !u.dmOff,
      blockedByMe: (me.dmBlocked ?? []).includes(u.id),
    };
  }

  async chats(me: User) {
    const cards = [];
    for (const c of await this.storage.listChatsOf(me.id)) {
      if (await this.expire(c)) continue;
      cards.push(await this.card(c, me.id));
    }
    return cards.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  }

  /** Непрочитанные сообщения и входящие вопросы — для счётчика в меню. */
  async unread(me: User) {
    let messages = 0;
    let requests = 0;
    for (const c of await this.storage.listChatsOf(me.id)) {
      if (await this.expire(c)) continue;
      if (c.status === 'pending' && c.requestedBy !== me.id) requests++;
      if (c.status === 'active')
        messages += this.unreadOf(c, me.id, await this.storage.listDm(c.id));
    }
    return { messages, requests, total: messages + requests };
  }

  // ——— вопрос, ответ, завершение ———

  /**
   * «Спросить лично» (из темы Бат-Форума) или «Спросить снова» (из архива): вопрос тому, кто
   * отвечал в теме, или тому, кого я уже спрашивал по ней. Первое сообщение — сам вопрос.
   */
  async request(me: User, body: { threadId?: unknown; userId?: unknown; text?: unknown }) {
    const threadId = typeof body?.threadId === 'string' ? body.threadId : '';
    const userId = typeof body?.userId === 'string' ? body.userId : '';
    const text = typeof body?.text === 'string' ? maskPersonalData(body.text.trim()).text : '';
    if (!threadId || !userId) throw new BadRequestException('Не указаны тема и человек');
    if (text.length < QUESTION_MIN)
      throw new BadRequestException('Напишите вопрос — человек увидит его до того, как примет');
    if (text.length > QUESTION_MAX)
      throw new BadRequestException(`Вопрос — не длиннее ${QUESTION_MAX} символов`);
    const target = await this.storage.getUser(userId);
    if (!target) throw new NotFoundException('Человек не найден');
    if (target.id === me.id) throw new BadRequestException('Это вы');
    const fresh = (await this.storage.getUser(me.id)) ?? me;
    if (this.blockedBetween(fresh, target))
      throw new ForbiddenException('Написать этому человеку нельзя');
    if (target.dmOff) throw new ForbiddenException('Человек не принимает личные вопросы');

    const thread = await this.storage.getThread(threadId);
    const before = await this.askedBefore(me.id, target.id, threadId);
    if (!thread && !before) throw new NotFoundException('Тема не найдена');
    if (!before && !(await this.answeredIn(threadId, target.id)))
      throw new ForbiddenException('Спросить лично можно того, кто отвечал в этой теме');
    const title =
      thread?.title ??
      (await this.storage.listArchive(me.id)).find((e) => e.topicId === threadId)?.topicTitle ??
      'Тема удалена';

    const existing = await this.storage.chatAbout(me.id, target.id, threadId);
    if (existing && !(await this.expire(existing))) return this.card(existing, me.id);

    this.requests.take(me.id);
    try {
      this.incoming.take(target.id);
    } catch {
      throw new HttpException(
        `${target.name} уже получил(а) ${INCOMING_PER_DAY} личных вопроса за сутки. Спросите в теме или попробуйте завтра.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const at = now();
    const chat: DmChat = {
      id: randomUUID(),
      members: [me.id, target.id],
      status: 'pending',
      requestedBy: me.id,
      topicId: threadId,
      topicTitle: title,
      readAt: { [me.id]: at },
      lastAt: at,
      createdAt: at,
    };
    await this.storage.saveChat(chat);
    await this.storage.saveDm({
      id: randomUUID(),
      chatId: chat.id,
      authorId: me.id,
      text,
      createdAt: at,
    });
    return this.card(chat, me.id);
  }

  /** Помогающий принимает вопрос (отсюда — 7 дней) или отклоняет (у спрашивающего — в архив). */
  async decide(me: User, chatId: string, accept: boolean) {
    const chat = await this.own(me, chatId);
    if (chat.status !== 'pending' || chat.requestedBy === me.id)
      throw new BadRequestException('Вопроса, который ждёт вашего ответа, нет');
    if (!accept) {
      await this.close(chat, 'declined');
      return { ok: true, closed: true };
    }
    const at = now();
    return this.card(
      await this.storage.saveChat({
        ...chat,
        status: 'active',
        acceptedAt: at,
        lastAt: at,
        readAt: { ...chat.readAt, [me.id]: at },
      }),
      me.id,
    );
  }

  /**
   * «Проблема решена» — только спрашивающий; «Больше помочь не могу» — только помогающий.
   * Возвращает мою архивную копию.
   */
  async finish(me: User, chatId: string, how: 'solved' | 'helper_ended') {
    const chat = await this.own(me, chatId);
    const seeker = chat.requestedBy === me.id;
    if (how === 'solved' && !seeker)
      throw new ForbiddenException('«Проблема решена» отмечает тот, кто спрашивал');
    if (how === 'helper_ended' && seeker)
      throw new ForbiddenException('Завершить помощь может тот, кто помогает');
    if (chat.status !== 'active') throw new BadRequestException('Переписка ещё не началась');
    return { archiveId: await this.close(chat, how, me.id) };
  }

  /** Заблокировать собеседника: переписка закрывается, новых вопросов между вами не будет. */
  async block(me: User, chatId: string) {
    const chat = await this.own(me, chatId);
    await this.addBlock(me, this.other(chat, me.id));
    return { archiveId: await this.close(chat, 'blocked', me.id) };
  }

  private async addBlock(me: User, id: string) {
    const fresh = (await this.storage.getUser(me.id)) ?? me;
    await this.storage.updateUser({
      ...fresh,
      dmBlocked: [...new Set([...(fresh.dmBlocked ?? []), id])],
    });
  }

  async unblock(me: User, userId: string) {
    const fresh = (await this.storage.getUser(me.id)) ?? me;
    await this.storage.updateUser({
      ...fresh,
      dmBlocked: (fresh.dmBlocked ?? []).filter((x) => x !== userId),
    });
    return { ok: true };
  }

  /** Сообщения переписки; открыть — значит прочитать. */
  async messages(me: User, chatId: string) {
    const chat = await this.own(me, chatId);
    const list = await this.storage.listDm(chatId);
    const read = { ...chat, readAt: { ...chat.readAt, [me.id]: now() } };
    await this.storage.saveChat(read);
    return {
      chat: await this.card(read, me.id),
      messages: list.slice(-300).map((m) => ({
        id: m.id,
        text: m.text,
        mine: m.authorId === me.id,
        createdAt: m.createdAt,
      })),
    };
  }

  async send(me: User, chatId: string, raw: unknown) {
    const chat = await this.own(me, chatId);
    if (chat.status !== 'active')
      throw new ForbiddenException('Писать можно, когда человек примет вопрос');
    const text = typeof raw === 'string' ? maskPersonalData(raw.trim()).text : '';
    if (!text) throw new BadRequestException('Пустое сообщение');
    if (text.length > TEXT_MAX)
      throw new BadRequestException(`Сообщение — не длиннее ${TEXT_MAX} символов`);
    this.sends.take(me.id);
    const m: DmMessage = { id: randomUUID(), chatId, authorId: me.id, text, createdAt: now() };
    await this.storage.saveDm(m);
    await this.storage.saveChat({
      ...chat,
      lastAt: m.createdAt,
      readAt: { ...chat.readAt, [me.id]: m.createdAt },
    });
    return { id: m.id, text: m.text, mine: true, createdAt: m.createdAt };
  }

  /** Удалить переписку — сразу у обоих, с сервера целиком, без копий в архиве. */
  async remove(me: User, chatId: string) {
    const chat = await this.own(me, chatId);
    await this.storage.deleteChat(chat.id);
    return { ok: true };
  }

  /**
   * Жалоба: собеседник блокируется, переписка закрывается; специалисты получают только его
   * последние 10 сообщений в этой переписке (не всю переписку и не ваши сообщения).
   */
  async report(me: User, chatId: string, reasonRaw: unknown) {
    const chat = await this.own(me, chatId);
    const reason = typeof reasonRaw === 'string' ? reasonRaw.trim().slice(0, REASON_MAX) : '';
    if (!reason) throw new BadRequestException('Опишите, что случилось');
    const otherId = this.other(chat, me.id);
    const other = await this.storage.getUser(otherId);
    const theirs = (await this.storage.listDm(chatId))
      .filter((m) => m.authorId === otherId)
      .slice(-10);
    const report: DmReport = {
      id: randomUUID(),
      chatId,
      reporterId: me.id,
      reporterName: me.name,
      reportedId: otherId,
      reportedName: other
        ? `${other.name}${other.username ? ` (@${other.username})` : ''}`
        : 'Удалённый аккаунт',
      reason,
      messages: theirs.map((m) => ({ text: m.text, createdAt: m.createdAt })),
      createdAt: now(),
    };
    await this.storage.saveDmReport(report);
    await this.addBlock(me, otherId);
    return { ok: true, archiveId: await this.close(chat, 'blocked', me.id) };
  }

  // ——— архив (копия в кабинете, видна только владельцу) ———

  private async archiveCard(me: User, e: DmArchiveEntry) {
    const other = await this.storage.getUser(e.withId);
    const fresh = (await this.storage.getUser(me.id)) ?? me;
    const last = e.messages.at(-1);
    return {
      id: e.id,
      with: other ? profile(other) : gone(e.withId, e.withName, e.withUsername),
      topic: e.topicId ? { id: e.topicId, title: e.topicTitle ?? 'Тема' } : null,
      role: e.role,
      reason: e.reason,
      startedAt: e.startedAt,
      closedAt: e.closedAt,
      count: e.messages.length,
      last: last ? { text: last.text.slice(0, 140), mine: last.mine } : null,
      canAskAgain:
        e.role === 'seeker' &&
        !!e.topicId &&
        !!other &&
        !other.dmOff &&
        !this.blockedBetween(fresh, other),
    };
  }

  async archive(me: User) {
    const list = (await this.storage.listArchive(me.id)).sort((a, b) =>
      b.closedAt.localeCompare(a.closedAt),
    );
    return Promise.all(list.map((e) => this.archiveCard(me, e)));
  }

  async archived(me: User, id: string) {
    const e = await this.storage.getArchive(id);
    if (!e || e.ownerId !== me.id) throw new NotFoundException('В архиве такой переписки нет');
    return {
      ...(await this.archiveCard(me, e)),
      messages: e.messages.map((m) => ({
        id: m.id,
        text: m.text,
        mine: m.mine,
        createdAt: m.createdAt,
      })),
    };
  }

  /** Удалить свою копию из архива (у собеседника его копия остаётся у него). */
  async removeArchived(me: User, id: string) {
    const e = await this.storage.getArchive(id);
    if (!e || e.ownerId !== me.id) throw new NotFoundException('В архиве такой переписки нет');
    await this.storage.deleteArchive(id);
    return { ok: true };
  }

  // ——— специалист: жалобы ———

  async reports() {
    return (await this.storage.listDmReports())
      .filter((r) => !r.resolvedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async resolveReport(me: User, id: string) {
    const r = (await this.storage.listDmReports()).find((x) => x.id === id);
    if (!r) throw new NotFoundException('Жалоба не найдена');
    return this.storage.saveDmReport({ ...r, resolvedAt: now(), resolvedBy: me.name });
  }
}
