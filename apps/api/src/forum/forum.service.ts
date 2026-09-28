import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  STORAGE,
  type ForumCommunity,
  type ForumReply,
  type ForumReportReason,
  type ForumThread,
  type Storage,
  type User,
} from '../store/types';
import { CommunitiesService, type CommunityDraftInput } from './communities.service';
import { RateLimit } from './limits';
import { FALLBACK_SECTION, HIDE_AFTER_REPORTS, REPORT_REASONS } from './sections';
import { seedForum } from './seed';
import { junkReason, relevance, stems } from './text';

const TITLE_MIN = 5;
const TITLE_MAX = 150;
const BODY_MAX = 6000;
const REPLY_MAX = 4000;
const MODLOG_MAX = 20;
const now = () => new Date().toISOString();

/** best — рекомендации (свежее + полезное + похожее на ваши обращения), как «Лучшее» на Reddit. */
export type ThreadSort = 'best' | 'new' | 'top' | 'unanswered';

/** Тема скрыта из ленты: много жалоб, ждёт решения специалиста. */
const isHidden = (t: ForumThread) => (t.reports?.length ?? 0) >= HIDE_AFTER_REPORTS;

const cleanTitle = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

/**
 * БатФорум: сообщества, темы, ответы, «Полезно», решение. Пишут все; модерируют специалисты
 * (решение, закрепление, перенос, закрытие, заголовок, удаление, жалобы); автор может удалить
 * и переименовать своё. От мусора — фильтр текста и лимиты частоты (ТЗ v4.7, п. 16).
 */
@Injectable()
export class ForumService implements OnModuleInit {
  // от флуда: специалистов не ограничиваем
  private readonly threadLimit = new RateLimit(3, 10 * 60_000, 'новых тем');
  private readonly replyLimit = new RateLimit(10, 5 * 60_000, 'ответов');
  private readonly reportLimit = new RateLimit(20, 60 * 60_000, 'жалоб');

  constructor(
    @Inject(STORAGE) private readonly storage: Storage,
    private readonly communities: CommunitiesService,
  ) {}

  /** Стартовые сообщества и обсуждения — один раз, если форум пуст. */
  async onModuleInit() {
    await this.communities.all();
    if (await this.storage.getMeta('forumSeeded')) return;
    if ((await this.storage.listThreads()).length === 0) {
      const { threads, replies } = seedForum();
      for (const t of threads) await this.storage.saveThread(t);
      for (const r of replies) await this.storage.saveReply(r);
    }
    await this.storage.setMeta('forumSeeded', '1');
  }

  private view(t: ForumThread, me: User, full = false, because?: string) {
    const specialist = me.role === 'specialist';
    return {
      ...(because ? { because } : {}),
      id: t.id,
      sectionId: t.sectionId,
      title: t.title,
      body: full ? t.body : t.body.replace(/[*#>`_]/g, '').slice(0, 220),
      authorName: t.authorName,
      authorRole: t.authorRole,
      mine: t.authorId === me.id,
      score: t.voters.length,
      voted: t.voters.includes(me.id),
      pinned: t.pinned,
      solved: !!t.solutionId,
      replyCount: t.replyCount,
      fromRequest: !!t.fromRequest,
      createdAt: t.createdAt,
      activityAt: t.activityAt,
      locked: !!t.locked,
      hidden: isHidden(t),
      reported: !!t.reports?.some((r) => r.userId === me.id),
      ...(specialist ? { reports: t.reports?.length ?? 0 } : {}),
      ...(full ? { modlog: t.modlog ?? [] } : {}),
    };
  }

  private replyView(r: ForumReply, t: ForumThread, me: User) {
    return {
      id: r.id,
      body: r.body,
      authorName: r.authorName,
      authorRole: r.authorRole,
      mine: r.authorId === me.id,
      score: r.voters.length,
      voted: r.voters.includes(me.id),
      solution: t.solutionId === r.id,
      createdAt: r.createdAt,
    };
  }

  /** Скрытую тему видят только автор и специалисты. */
  private visible(t: ForumThread, me: User) {
    return !isHidden(t) || me.role === 'specialist' || t.authorId === me.id;
  }

  private sectionView(c: ForumCommunity, threads: ForumThread[], people: number) {
    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      icon: c.icon,
      builtin: c.builtin,
      threads: threads.length,
      unanswered: threads.filter((t) => t.replyCount === 0 && !t.pinned).length,
      solved: threads.filter((t) => t.solutionId).length,
      members: people,
      activityAt: threads.reduce<string | null>(
        (m, t) => (!m || t.activityAt > m ? t.activityAt : m),
        null,
      ),
    };
  }

  /** Сообщества со статистикой: тем, решено, без ответа, участников, последняя активность. */
  async sections() {
    const threads = (await this.storage.listThreads()).filter((t) => !isHidden(t));
    const replies = await this.storage.listAllReplies();
    const out = [];
    for (const c of await this.communities.active()) {
      const list = threads.filter((t) => t.sectionId === c.id);
      const ids = new Set(list.map((t) => t.id));
      const people = new Set(list.map((t) => t.authorId));
      for (const r of replies) if (ids.has(r.threadId)) people.add(r.authorId);
      out.push(this.sectionView(c, list, people.size));
    }
    return out;
  }

  /** Названия обращений пользователя — чтобы рекомендовать похожие темы («Для вас»). */
  private async interests(me: User): Promise<{ title: string; stems: string[] }[]> {
    try {
      const blob = await this.storage.getBoard(me.id);
      if (!blob) return [];
      const state = (
        JSON.parse(blob.data) as {
          state?: { tasks?: Record<string, { title?: string; createdAt?: string }> };
        }
      ).state;
      return Object.values(state?.tasks ?? {})
        .filter((t) => typeof t.title === 'string' && t.title.length > 5)
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
        .slice(0, 20)
        .map((t) => ({ title: t.title!, stems: stems(t.title!) }));
    } catch {
      return [];
    }
  }

  async list(me: User, opts: { section?: string; sort?: string; q?: string }) {
    const q = stems(opts.q ?? '');
    let list = (await this.storage.listThreads()).filter((t) => this.visible(t, me));
    if (opts.section && (await this.communities.isActive(opts.section)))
      list = list.filter((t) => t.sectionId === opts.section);
    const sort: ThreadSort =
      opts.sort === 'new' || opts.sort === 'unanswered' || opts.sort === 'top' ? opts.sort : 'best';
    if (sort === 'unanswered') list = list.filter((t) => t.replyCount === 0 && !t.pinned);
    if (q.length) {
      const scored = list
        .map((t) => ({ t, s: relevance(t, q) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || b.t.voters.length - a.t.voters.length);
      return scored.slice(0, 50).map((x) => this.view(x.t, me));
    }
    if (sort === 'best') {
      // Рекомендации: «горячесть» (полезно + решение + ответы, со временем остывает)
      // и заметный подъём тем, похожих на обращения этого человека
      const mine = await this.interests(me);
      const nowMs = Date.now();
      const ranked = list.map((t) => {
        const ageH = Math.max(0, (nowMs - new Date(t.activityAt).getTime()) / 3_600_000);
        const hot =
          (t.voters.length + (t.solutionId ? 3 : 0) + t.replyCount * 0.5 + 1) /
          Math.pow(ageH + 2, 0.5);
        let because: string | undefined;
        let best = 0;
        for (const it of mine) {
          const r = relevance(t, it.stems);
          if (r > best) {
            best = r;
            because = it.title;
          }
        }
        const personal = best >= 4;
        return {
          t,
          rank: hot + (personal ? 2 + best * 0.2 : 0),
          because: personal ? because : undefined,
        };
      });
      ranked.sort((a, b) => (a.t.pinned !== b.t.pinned ? (a.t.pinned ? -1 : 1) : b.rank - a.rank));
      return ranked.slice(0, 100).map((x) => this.view(x.t, me, false, x.because));
    }
    list.sort((a, b) =>
      a.pinned !== b.pinned
        ? a.pinned
          ? -1
          : 1
        : sort === 'top'
          ? b.voters.length - a.voters.length || b.activityAt.localeCompare(a.activityAt)
          : b.createdAt.localeCompare(a.createdAt),
    );
    return list.slice(0, 100).map((t) => this.view(t, me));
  }

  /** Похожие обсуждения для текста обращения (подсказка перед отправкой). */
  async similar(me: User, text: string) {
    const q = stems(text);
    if (q.length < 1) return [];
    return (
      (await this.storage.listThreads())
        .filter((t) => !isHidden(t))
        .map((t) => ({ t, s: relevance(t, q) + (t.solutionId ? 1 : 0) }))
        // хотя бы два совпадения (или одно в названии + решение) — иначе подсказка шумит
        .filter((x) => x.s >= 4)
        .sort((a, b) => b.s - a.s || b.t.voters.length - a.t.voters.length)
        .slice(0, 3)
        .map((x) => this.view(x.t, me))
    );
  }

  private async load(id: string) {
    const t = await this.storage.getThread(id);
    if (!t) throw new NotFoundException('Тема не найдена — возможно, её удалили');
    return t;
  }

  /** Тема, которую этот человек может видеть. */
  private async loadVisible(me: User, id: string) {
    const t = await this.load(id);
    if (!this.visible(t, me))
      throw new NotFoundException('Тема скрыта: на неё пожаловались, её проверяет специалист');
    return t;
  }

  async get(me: User, id: string) {
    const t = await this.loadVisible(me, id);
    const replies = (await this.storage.listReplies(id)).sort((a, b) =>
      a.id === t.solutionId
        ? -1
        : b.id === t.solutionId
          ? 1
          : b.voters.length - a.voters.length || a.createdAt.localeCompare(b.createdAt),
    );
    return {
      thread: this.view(t, me, true),
      replies: replies.map((r) => this.replyView(r, t, me)),
      canModerate: me.role === 'specialist',
    };
  }

  private checkTitle(title: string) {
    if (title.length < TITLE_MIN)
      throw new BadRequestException('Название — хотя бы несколько слов');
    if (title.length > TITLE_MAX)
      throw new BadRequestException(`Название — не длиннее ${TITLE_MAX} символов`);
    const junk = junkReason(title, 'title');
    if (junk) throw new BadRequestException(junk);
  }

  async create(
    me: User,
    body: { sectionId?: unknown; title?: unknown; body?: unknown; fromRequest?: unknown },
  ) {
    const title = cleanTitle(body?.title);
    const text = typeof body?.body === 'string' ? body.body.trim() : '';
    if (!(await this.communities.isActive(body?.sectionId)))
      throw new BadRequestException('Выберите сообщество');
    this.checkTitle(title);
    if (text.length > BODY_MAX) throw new BadRequestException('Текст слишком длинный');
    const junk = junkReason(text, 'body');
    if (junk)
      throw new BadRequestException(`Подробности: ${junk.charAt(0).toLowerCase()}${junk.slice(1)}`);
    if (me.role !== 'specialist') this.threadLimit.take(me.id);
    const t: ForumThread = {
      id: randomUUID(),
      sectionId: body.sectionId as string,
      title,
      body: text,
      authorId: me.id,
      authorName: me.name,
      authorRole: me.role,
      voters: [],
      pinned: false,
      solutionId: null,
      replyCount: 0,
      fromRequest: body?.fromRequest === true,
      createdAt: now(),
      activityAt: now(),
    };
    await this.storage.saveThread(t);
    return this.view(t, me, true);
  }

  async reply(me: User, threadId: string, textRaw: unknown) {
    const text = typeof textRaw === 'string' ? textRaw.trim() : '';
    if (!text) throw new BadRequestException('Пустой ответ');
    if (text.length > REPLY_MAX) throw new BadRequestException('Ответ слишком длинный');
    const junk = junkReason(text, 'reply');
    if (junk) throw new BadRequestException(junk);
    const t = await this.loadVisible(me, threadId);
    if (t.locked && me.role !== 'specialist')
      throw new ForbiddenException('Тема закрыта для ответов');
    if (me.role !== 'specialist') this.replyLimit.take(me.id);
    const r: ForumReply = {
      id: randomUUID(),
      threadId,
      body: text,
      authorId: me.id,
      authorName: me.name,
      authorRole: me.role,
      voters: [],
      createdAt: now(),
    };
    await this.storage.saveReply(r);
    await this.storage.saveThread({ ...t, replyCount: t.replyCount + 1, activityAt: now() });
    return this.get(me, threadId);
  }

  async voteThread(me: User, id: string) {
    const t = await this.loadVisible(me, id);
    const voters = t.voters.includes(me.id)
      ? t.voters.filter((v) => v !== me.id)
      : [...t.voters, me.id];
    await this.storage.saveThread({ ...t, voters });
    return this.get(me, id);
  }

  async voteReply(me: User, replyId: string) {
    const r = await this.storage.getReply(replyId);
    if (!r) throw new NotFoundException('Ответ не найден');
    await this.loadVisible(me, r.threadId);
    const voters = r.voters.includes(me.id)
      ? r.voters.filter((v) => v !== me.id)
      : [...r.voters, me.id];
    await this.storage.saveReply({ ...r, voters });
    return this.get(me, r.threadId);
  }

  /** Отметить решение (или снять): автор темы или специалист. */
  async setSolution(me: User, id: string, replyId: unknown) {
    const t = await this.loadVisible(me, id);
    if (t.authorId !== me.id && me.role !== 'specialist')
      throw new ForbiddenException('Решение отмечает автор темы или специалист');
    let solutionId: string | null = null;
    if (typeof replyId === 'string') {
      const r = await this.storage.getReply(replyId);
      if (!r || r.threadId !== id) throw new BadRequestException('Это ответ из другой темы');
      solutionId = replyId;
    }
    await this.storage.saveThread({ ...t, solutionId, activityAt: now() });
    return this.get(me, id);
  }

  // ——— Модерация (v4.7) ———

  private specialist(me: User, what: string) {
    if (me.role !== 'specialist') throw new ForbiddenException(`${what} — только специалисты`);
  }

  /** Запись в журнал модерации темы. Решение специалиста снимает жалобы. */
  private moderated(t: ForumThread, me: User, text: string): ForumThread {
    return {
      ...t,
      reports: me.role === 'specialist' ? [] : t.reports,
      modlog: [...(t.modlog ?? []), { at: now(), byName: me.name, text }].slice(-MODLOG_MAX),
    };
  }

  private handle(c: ForumCommunity | undefined, id: string) {
    return c ? `б/${c.slug}` : id;
  }

  async pin(me: User, id: string, pinned: unknown) {
    this.specialist(me, 'Закреплять');
    const t = await this.load(id);
    await this.storage.saveThread({ ...t, pinned: pinned === true });
    return this.get(me, id);
  }

  /** Перенести тему в другое сообщество. */
  async move(me: User, id: string, sectionId: unknown) {
    this.specialist(me, 'Переносить темы');
    const t = await this.load(id);
    const to = (await this.communities.active()).find((c) => c.id === sectionId);
    if (!to) throw new BadRequestException('Выберите сообщество');
    if (to.id === t.sectionId) throw new BadRequestException('Тема уже в этом сообществе');
    const from = (await this.communities.all()).find((c) => c.id === t.sectionId);
    await this.storage.saveThread({
      ...this.moderated(t, me, `перенёс из ${this.handle(from, t.sectionId)} в б/${to.slug}`),
      sectionId: to.id,
    });
    return this.get(me, id);
  }

  /** Закрыть или открыть тему для ответов. */
  async lock(me: User, id: string, locked: unknown) {
    this.specialist(me, 'Закрывать темы');
    const t = await this.load(id);
    const on = locked === true;
    if (!!t.locked === on) return this.get(me, id);
    await this.storage.saveThread({
      ...this.moderated(t, me, on ? 'закрыл тему для ответов' : 'открыл тему для ответов'),
      locked: on,
    });
    return this.get(me, id);
  }

  /** Изменить заголовок: автор или специалист. */
  async rename(me: User, id: string, titleRaw: unknown) {
    const t = await this.load(id);
    const mine = t.authorId === me.id;
    if (!mine && me.role !== 'specialist')
      throw new ForbiddenException('Заголовок меняет автор или специалист');
    const title = cleanTitle(titleRaw);
    this.checkTitle(title);
    if (title === t.title) return this.get(me, id);
    const next = mine ? { ...t } : this.moderated(t, me, 'изменил заголовок');
    await this.storage.saveThread({ ...next, title });
    return this.get(me, id);
  }

  async removeThread(me: User, id: string) {
    const t = await this.load(id);
    if (t.authorId !== me.id && me.role !== 'specialist')
      throw new ForbiddenException('Удалить может автор или специалист');
    await this.storage.deleteThread(id);
  }

  async removeReply(me: User, replyId: string) {
    const r = await this.storage.getReply(replyId);
    if (!r) throw new NotFoundException('Ответ не найден');
    if (r.authorId !== me.id && me.role !== 'specialist')
      throw new ForbiddenException('Удалить может автор или специалист');
    await this.storage.deleteReply(replyId);
    return this.get(me, r.threadId);
  }

  /** Пожаловаться на тему: одна жалоба от человека (повторная — обновляет причину). */
  async report(me: User, id: string, body: { reason?: unknown; note?: unknown }) {
    const t = await this.loadVisible(me, id);
    if (t.authorId === me.id) throw new BadRequestException('На свою тему жаловаться не нужно');
    if (me.role === 'specialist')
      throw new BadRequestException('Специалист решает сам: перенесите, закройте или удалите тему');
    const reason = REPORT_REASONS.includes(body?.reason as never)
      ? (body.reason as ForumReportReason)
      : null;
    if (!reason) throw new BadRequestException('Выберите причину');
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 300) : '';
    if (reason === 'other' && !note) throw new BadRequestException('Напишите, что не так');
    this.reportLimit.take(me.id);
    const reports = (t.reports ?? []).filter((r) => r.userId !== me.id);
    reports.push({
      userId: me.id,
      userName: me.name,
      reason,
      ...(note ? { note } : {}),
      at: now(),
    });
    await this.storage.saveThread({ ...t, reports });
    return { reported: true, hidden: reports.length >= HIDE_AFTER_REPORTS };
  }

  /** Специалист оставляет тему как есть — жалобы снимаются. */
  async dismissReports(me: User, id: string) {
    this.specialist(me, 'Разбирать жалобы');
    const t = await this.load(id);
    await this.storage.saveThread({ ...t, reports: [] });
    return this.get(me, id);
  }

  // ——— Сообщества (v4.7) ———

  private proposalView(c: ForumCommunity, me: User) {
    const decided = c.status !== 'proposed';
    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      icon: c.icon,
      status: c.status,
      authorName: c.createdByName,
      mine: c.createdById === me.id,
      createdAt: c.createdAt,
      ...(decided && c.decidedByName ? { decidedByName: c.decidedByName } : {}),
      ...(decided && c.decidedAt ? { decidedAt: c.decidedAt } : {}),
      ...(c.note ? { note: c.note } : {}),
    };
  }

  /** Специалист создаёт сообщество, сотрудник — предлагает. */
  async createCommunity(me: User, raw: CommunityDraftInput) {
    const c = await this.communities.create(me, raw);
    return c.status === 'active'
      ? { status: 'active' as const, section: this.sectionView(c, [], 0) }
      : { status: 'proposed' as const, proposal: this.proposalView(c, me) };
  }

  async updateCommunity(me: User, id: string, raw: CommunityDraftInput) {
    await this.communities.update(me, id, raw);
    return this.sections();
  }

  /** В архив; темы переезжают в «Другое» с записью в журнале. */
  async archiveCommunity(me: User, id: string) {
    const c = await this.communities.archive(me, id);
    const fallback = (await this.communities.active()).find((x) => x.id === FALLBACK_SECTION);
    let moved = 0;
    for (const t of await this.storage.listThreads()) {
      if (t.sectionId !== c.id) continue;
      moved += 1;
      await this.storage.saveThread({
        ...this.moderated(
          t,
          me,
          `перенёс из б/${c.slug} в ${this.handle(fallback, FALLBACK_SECTION)} (сообщество в архиве)`,
        ),
        // жалобы на тему не снимаем: перенос — не решение по ней
        reports: t.reports,
        sectionId: FALLBACK_SECTION,
      });
    }
    return { moved };
  }

  async proposals(me: User) {
    return (await this.communities.proposals(me)).map((c) => this.proposalView(c, me));
  }

  async approve(me: User, id: string, raw: CommunityDraftInput) {
    const c = await this.communities.approve(me, id, raw);
    return this.sectionView(c, [], 0);
  }

  async reject(me: User, id: string, note: unknown) {
    return this.proposalView(await this.communities.reject(me, id, note), me);
  }

  // ——— «На проверке» для специалиста ———

  async review(me: User) {
    this.specialist(me, 'Очередь проверки');
    const reported = (await this.storage.listThreads())
      .filter((t) => (t.reports?.length ?? 0) > 0)
      .sort(
        (a, b) =>
          b.reports!.length - a.reports!.length ||
          (b.reports!.at(-1)?.at ?? '').localeCompare(a.reports!.at(-1)?.at ?? ''),
      );
    return {
      reports: reported.map((t) => ({
        thread: this.view(t, me),
        reports: t.reports!.map((r) => ({
          reason: r.reason,
          ...(r.note ? { note: r.note } : {}),
          byName: r.userName,
          at: r.at,
        })),
      })),
      proposals: await this.proposals(me),
    };
  }

  async reviewCount(me: User) {
    this.specialist(me, 'Очередь проверки');
    const threads = await this.storage.listThreads();
    return {
      reports: threads.filter((t) => (t.reports?.length ?? 0) > 0).length,
      proposals: (await this.communities.proposals(me)).length,
    };
  }
}
