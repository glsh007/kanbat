import { maskPersonalData } from '../common/pii';
import { config } from '../config';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  STORAGE,
  type CloseReason,
  type Escalation,
  type EscalationClosed,
  type EscalationStatus,
  type Storage,
  type SupportTimers,
  type Ticket,
  type TicketReturn,
  type User,
} from '../store/types';

const STATUSES: EscalationStatus[] = ['new', 'in_progress', 'answered', 'resolved'];
const MAX_MESSAGES = 300;
const REPLY_MAX = 4000;

const now = () => new Date().toISOString();
const iso = (ms: number) => new Date(ms).toISOString();

/** Сроки по умолчанию (ТЗ v4.22): 24 ч до автозакрытия, 4 ч до автовозврата. */
export const DEFAULT_TIMERS: SupportTimers = { closeHours: 24, returnHours: 4 };
const CLOSE_HOURS = [4, 24, 72] as const;
const RETURN_HOURS = [2, 4, 8] as const;
const TIMERS_KEY = 'supportTimers';
const CLOSE_REASONS: CloseReason[] = ['spam', 'duplicate', 'wrong', 'other'];
const isAdminUser = (u: User) => u.role === 'specialist' && u.admin === true;

/** Закрытие, присланное владельцем: только «подтвердил человек» (остальное решает сервер). */
function asClosed(v: unknown): EscalationClosed | null {
  if (!v || typeof v !== 'object') return null;
  const c = v as Partial<EscalationClosed>;
  if (c.by !== 'user') return null;
  return {
    by: 'user',
    at: typeof c.at === 'string' ? c.at.slice(0, 40) : now(),
    ...(c.self === true ? { self: true } : {}),
  };
}

type RawMessage = {
  id?: unknown;
  taskId?: unknown;
  role?: unknown;
  content?: unknown;
  createdAt?: unknown;
  stepReport?: unknown;
  answerTo?: unknown;
};

/**
 * Специалист видит только сводку и сообщения человека после передачи (ТЗ v4.4, п. 14).
 * Всё остальное — разговор с ИИ, ответы на кнопки — на сервер в обращение не попадает.
 * То же правило, что `messagesForSpecialist` в packages/shared.
 */
/**
 * Просьба «Срочно» от человека (ТЗ v4.16): только причина и время. На очередь и сроки не влияет —
 * специалист видит её как просьбу.
 */
function asUrgent(raw: unknown): { reason: string; at: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { reason?: unknown; at?: unknown };
  const reason =
    typeof r.reason === 'string' ? maskPersonalData(r.reason.trim()).text.slice(0, 300) : '';
  if (!reason) return null;
  return { reason, at: typeof r.at === 'string' ? r.at.slice(0, 40) : now() };
}

function afterHandoff(messages: unknown, escalation: Pick<Escalation, 'createdAt'>) {
  if (!Array.isArray(messages)) return [];
  return (messages as RawMessage[])
    .filter(
      (m) =>
        m &&
        m.role === 'user' &&
        typeof m.content === 'string' &&
        typeof m.createdAt === 'string' &&
        m.createdAt > escalation.createdAt &&
        !m.stepReport &&
        !m.answerTo,
    )
    .slice(-MAX_MESSAGES)
    .map((m) => ({
      id: String(m.id ?? randomUUID()).slice(0, 100),
      taskId: String(m.taskId ?? '').slice(0, 100),
      role: 'user' as const,
      kind: 'text' as const,
      content: maskPersonalData(String(m.content).slice(0, REPLY_MAX)).text,
      createdAt: String(m.createdAt),
    }));
}

/** Старые обращения (до v4.4) могли хранить всю переписку — отдаём уже очищенными. */
const clean = (t: Ticket): Ticket => ({ ...t, messages: afterHandoff(t.messages, t.escalation) });

function asEscalation(v: unknown): Escalation {
  const e = v as Partial<Escalation> | null;
  if (!e || typeof e !== 'object' || !STATUSES.includes(e.status as EscalationStatus))
    throw new BadRequestException('escalation: неверный формат');
  if (!e.handoff || typeof e.handoff !== 'object')
    throw new BadRequestException('escalation.handoff обязателен');
  return {
    status: e.status as EscalationStatus,
    handoff: e.handoff,
    reason: typeof e.reason === 'string' ? e.reason.slice(0, 300) : '',
    createdAt: typeof e.createdAt === 'string' ? e.createdAt : now(),
    updatedAt: typeof e.updatedAt === 'string' ? e.updatedAt : now(),
    rev: Number.isFinite(e.rev) ? Number(e.rev) : 0,
    closed: asClosed(e.closed),
  };
}

/** Последнее сообщение человека (после передачи), ISO или ''. */
const lastUserAt = (t: Ticket) =>
  (t.messages as { createdAt?: string }[]).reduce(
    (a, m) => (typeof m.createdAt === 'string' && m.createdAt > a ? m.createdAt : a),
    '',
  );

/**
 * Обращения к специалисту. Владелец задачи присылает переписку и сводку, специалист — ответы
 * и статусы. Статус несёт ревизию: побеждает бо́льшая, при равной — то, что уже на сервере.
 */
@Injectable()
export class SupportService implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(STORAGE) private readonly storage: Storage) {}

  private sweep: ReturnType<typeof setInterval> | null = null;

  private clock: ReturnType<typeof setInterval> | null = null;
  private timers: SupportTimers | null = null;
  private lastTick = 0;

  async onModuleInit() {
    void this.prune();
    // раз в 6 часов; таймер не держит процесс
    this.sweep = setInterval(() => void this.prune(), 6 * 3_600_000);
    this.sweep.unref?.();
    // сроки заявок (ТЗ v4.22): раз в 10 минут (в автопроверках — чаще, по длине «часа»)
    this.clock = setInterval(() => void this.tick(), Math.min(600_000, config.supportHourMs / 4));
    this.clock.unref?.();
    await this.tick();
  }

  onModuleDestroy() {
    if (this.sweep) clearInterval(this.sweep);
    if (this.clock) clearInterval(this.clock);
  }

  // ——— Сроки заявок (ТЗ v4.22) ———

  async settings(): Promise<SupportTimers> {
    if (this.timers) return this.timers;
    try {
      const raw = JSON.parse(
        (await this.storage.getMeta(TIMERS_KEY)) ?? 'null',
      ) as Partial<SupportTimers> | null;
      this.timers = {
        closeHours: CLOSE_HOURS.includes(raw?.closeHours as never)
          ? (raw!.closeHours as SupportTimers['closeHours'])
          : DEFAULT_TIMERS.closeHours,
        returnHours: RETURN_HOURS.includes(raw?.returnHours as never)
          ? (raw!.returnHours as SupportTimers['returnHours'])
          : DEFAULT_TIMERS.returnHours,
      };
    } catch {
      this.timers = { ...DEFAULT_TIMERS };
    }
    return this.timers;
  }

  async saveSettings(raw: { closeHours?: unknown; returnHours?: unknown }) {
    const cur = await this.settings();
    const close = raw?.closeHours === undefined ? cur.closeHours : Number(raw.closeHours);
    const back = raw?.returnHours === undefined ? cur.returnHours : Number(raw.returnHours);
    if (!CLOSE_HOURS.includes(close as never))
      throw new BadRequestException('Автозакрытие: 4, 24 или 72 часа');
    if (!RETURN_HOURS.includes(back as never))
      throw new BadRequestException('Автовозврат: 2, 4 или 8 часов');
    this.timers = {
      closeHours: close as SupportTimers['closeHours'],
      returnHours: back as SupportTimers['returnHours'],
    };
    await this.storage.setMeta(TIMERS_KEY, JSON.stringify(this.timers));
    return this.timers;
  }

  /** Срок автозакрытия и напоминания — от ответа специалиста. */
  private async closePlan(fromMs: number) {
    const h = config.supportHourMs;
    const { closeHours } = await this.settings();
    const closeMs = fromMs + closeHours * h;
    // напоминание — за 3 «часа», а при коротком сроке — за четверть
    return { closeAt: iso(closeMs), remindAt: iso(closeMs - Math.min(3, closeHours / 4) * h) };
  }

  /**
   * Сроки заявок (ТЗ v4.22), проходит раз в 10 минут и перед выдачей списков:
   * - ответ специалиста без ответа человека `closeHours` — заявка закрывается сама;
   * - принятая заявка без ответа специалиста `returnHours` (с момента принятия или последнего
   *   сообщения человека) — возвращается в общую очередь.
   */
  async tick(nowMs = Date.now()): Promise<{ closed: number; returned: number }> {
    this.lastTick = nowMs;
    const h = config.supportHourMs;
    const { returnHours } = await this.settings();
    let closed = 0;
    let returned = 0;
    for (const raw of await this.storage.listTickets()) {
      if (raw.archived) continue;
      const t = clean(raw);
      const e = t.escalation;
      if (e.status === 'answered' && e.closeAt && Date.parse(e.closeAt) <= nowMs) {
        await this.storage.saveTicket(
          this.setStatus(t, 'resolved', {
            closed: { by: 'auto', at: iso(nowMs) },
            closeAt: null,
            remindAt: null,
          }),
        );
        closed++;
        continue;
      }
      if (e.status === 'in_progress' && t.takenBy) {
        const since = [t.takenAt ?? '', lastUserAt(t), e.updatedAt].sort().at(-1)!;
        if (Date.parse(since) + returnHours * h <= nowMs) {
          await this.storage.saveTicket(
            this.toQueue(t, { at: iso(nowMs), reason: 'timeout', from: t.takenBy.name }),
          );
          returned++;
        }
      }
    }
    return { closed, returned };
  }

  /** Перед выдачей списков — сроки, не чаще раза в 30 секунд (в автопроверках — чаще). */
  private async fresh() {
    if (Date.now() - this.lastTick >= Math.min(30_000, config.supportHourMs / 10))
      await this.tick();
  }

  /** Вернуть заявку в общую очередь. */
  private toQueue(t: Ticket, returned: TicketReturn): Ticket {
    return {
      ...this.setStatus(t, 'new', { closed: null, closeAt: null, remindAt: null }),
      takenBy: null,
      takenAt: null,
      returned,
    };
  }

  /**
   * Срок хранения (ТЗ v4.16): у заявок, решённых дольше `TICKET_KEEP_DAYS` назад (по умолчанию 90 дней),
   * удаляется переписка — сообщения человека и ответы специалиста. Остаются сводка, статус и даты:
   * для статистики и разбора этого достаточно, а личной переписки на сервере меньше.
   */
  async prune(now = Date.now()): Promise<number> {
    const edge = now - config.ticketKeepDays * 24 * 3_600_000;
    let n = 0;
    for (const t of await this.storage.listTickets()) {
      if (t.archived || t.escalation.status !== 'resolved') continue;
      if (Date.parse(t.escalation.updatedAt) > edge) continue;
      await this.storage.saveTicket({
        ...t,
        messages: [],
        replies: [],
        urgent: null,
        archived: true,
      });
      n++;
    }
    if (n) console.log(`Срок хранения: переписка ${n} решённых заявок удалена, сводки остались`);
    return n;
  }

  /** Владелец передал обращение или что-то в нём изменилось (переписка, статус). */
  async push(
    user: User,
    body: {
      taskId?: unknown;
      title?: unknown;
      escalation?: unknown;
      messages?: unknown;
      urgent?: unknown;
    },
  ) {
    const urgent = asUrgent(body.urgent);
    const taskId = typeof body?.taskId === 'string' ? body.taskId.slice(0, 100) : '';
    if (!taskId) throw new BadRequestException('taskId обязателен');
    const escalation = asEscalation(body.escalation);
    const title = typeof body.title === 'string' ? body.title.slice(0, 200) : 'Обращение';
    const messages = afterHandoff(body.messages, escalation);

    const prev = await this.storage.ticketByTask(user.id, taskId);
    if (!prev) {
      return this.storage.saveTicket({
        id: randomUUID(),
        taskId,
        ownerId: user.id,
        ownerName: user.name,
        title,
        escalation: { ...escalation, rev: escalation.rev ?? 0 },
        messages,
        replies: [],
        urgent,
        createdAt: now(),
        updatedAt: now(),
      });
    }
    const theirs = escalation.rev ?? 0;
    const ours = prev.escalation.rev ?? 0;
    // новая передача после «Решено» — новая сводка; иначе статус решает ревизия
    const newer = theirs > ours;
    let next: Escalation = newer
      ? {
          ...escalation,
          // срок автозакрытия ставит сервер: у владельца он мог устареть
          closeAt: prev.escalation.closeAt ?? null,
          remindAt: prev.escalation.remindAt ?? null,
        }
      : prev.escalation;
    let patch: Partial<Ticket> = {};
    if (newer) {
      const was = prev.escalation.status;
      if (next.status === 'resolved') {
        // человек подтвердил «Решено»
        next = {
          ...next,
          closed: next.closed ?? { by: 'user', at: now() },
          closeAt: null,
          remindAt: null,
        };
      } else if (next.status === 'new' || was === 'resolved') {
        // возобновил закрытую (или новая передача) — снова в общую очередь (ТЗ v4.22)
        next = { ...next, status: 'new', closed: null, closeAt: null, remindAt: null };
        patch = {
          takenBy: null,
          takenAt: null,
          returned:
            was === 'resolved' ? { at: now(), reason: 'reopened', from: prev.takenBy?.name } : null,
        };
      } else {
        // «Не помогло» или новое сообщение после ответа — снова у того же специалиста;
        // если заявку никто не ведёт (вернулась в очередь) — она остаётся в «Новых»
        next = {
          ...next,
          status: prev.takenBy ? next.status : 'new',
          closed: null,
          closeAt: null,
          remindAt: null,
        };
      }
    }
    return this.storage.saveTicket({
      ...prev,
      ...patch,
      title,
      messages: afterHandoff(body.messages, next),
      escalation: next,
      // просьба «Срочно» — решение владельца: последняя присланная (или снятая)
      urgent,
      updatedAt: now(),
    });
  }

  async mine(user: User) {
    await this.fresh();
    return (await this.storage.ticketsOf(user.id)).map(clean);
  }

  async all() {
    await this.fresh();
    return (await this.storage.listTickets()).map(clean);
  }

  /** Специалисты — для «Передать другому» у администратора. */
  async specialists() {
    return (await this.storage.listUsers())
      .filter((u) => u.role === 'specialist')
      .map((u) => ({ id: u.id, name: u.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }

  private async load(id: string) {
    const t = await this.storage.getTicket(id);
    if (!t) throw new NotFoundException('Обращение не найдено');
    // при следующем сохранении старая переписка (если была) исчезнет и из хранилища
    return clean(t);
  }

  private setStatus(t: Ticket, status: EscalationStatus, extra: Partial<Escalation> = {}): Ticket {
    return {
      ...t,
      escalation: {
        ...t.escalation,
        ...extra,
        status,
        updatedAt: now(),
        rev: (t.escalation.rev ?? 0) + 1,
      },
      updatedAt: now(),
    };
  }

  /** Заявку ведёт другой специалист — отвечать и закрывать может только он или администратор. */
  private assertHolder(t: Ticket, who: User) {
    if (t.takenBy && t.takenBy.id !== who.id && !isAdminUser(who))
      throw new ForbiddenException(
        `Заявку ведёт ${t.takenBy.name}. Передать её может администратор.`,
      );
  }

  private assertOpen(t: Ticket) {
    if (t.escalation.status === 'resolved') throw new ConflictException('Заявка уже закрыта');
  }

  /** «Принять в работу»: заявка закрепляется за специалистом и пропадает у других (ТЗ v4.22). */
  async take(specialist: User, id: string) {
    const t = await this.load(id);
    this.assertOpen(t);
    if (t.takenBy && t.takenBy.id !== specialist.id)
      throw new ConflictException(`Заявку уже принял(а) ${t.takenBy.name}`);
    if (t.takenBy) return t;
    return this.storage.saveTicket({
      ...this.setStatus(t, t.escalation.status === 'new' ? 'in_progress' : t.escalation.status),
      takenBy: { id: specialist.id, name: specialist.name },
      takenAt: now(),
      returned: null,
    });
  }

  async reply(specialist: User, id: string, textRaw: unknown) {
    const text = typeof textRaw === 'string' ? textRaw.trim().slice(0, REPLY_MAX) : '';
    if (!text) throw new BadRequestException('Пустой ответ');
    const t = await this.load(id);
    this.assertOpen(t);
    this.assertHolder(t, specialist);
    const next = this.setStatus(t, 'answered', {
      ...(await this.closePlan(Date.now())),
      closed: null,
    });
    // ответил — значит, принял (если заявка была в общей очереди)
    if (!t.takenBy) {
      next.takenBy = { id: specialist.id, name: specialist.name };
      next.takenAt = now();
      next.returned = null;
    }
    next.replies = [
      ...t.replies,
      { id: randomUUID(), text, authorName: specialist.name, createdAt: now() },
    ];
    return this.storage.saveTicket(next);
  }

  /** «Вернуть в общую очередь» — тот, кто ведёт, или администратор. */
  async release(who: User, id: string) {
    const t = await this.load(id);
    this.assertOpen(t);
    if (!t.takenBy) return t;
    this.assertHolder(t, who);
    const byAdmin = t.takenBy.id !== who.id;
    return this.storage.saveTicket(
      this.toQueue(t, { at: now(), reason: byAdmin ? 'admin' : 'manual', from: t.takenBy.name }),
    );
  }

  /** Администратор передаёт заявку специалисту (ТЗ v4.22). */
  async assign(admin: User, id: string, specialistIdRaw: unknown) {
    const specialistId = typeof specialistIdRaw === 'string' ? specialistIdRaw : '';
    if (!specialistId) return this.release(admin, id);
    const t = await this.load(id);
    this.assertOpen(t);
    const to = (await this.storage.listUsers()).find(
      (u) => u.id === specialistId && u.role === 'specialist',
    );
    if (!to) throw new NotFoundException('Специалист не найден');
    if (t.takenBy?.id === to.id) return t;
    return this.storage.saveTicket({
      ...this.setStatus(t, t.escalation.status === 'new' ? 'in_progress' : t.escalation.status),
      takenBy: { id: to.id, name: to.name },
      takenAt: now(),
      returned: null,
    });
  }

  /**
   * «Закрыть без решения» (ТЗ v4.22) — для мусора: спам, повтор, не по адресу. Решённой заявку
   * делает только человек («Решено») или срок.
   */
  async close(who: User, id: string, body: { reason?: unknown; note?: unknown }) {
    const reason = CLOSE_REASONS.includes(body?.reason as CloseReason)
      ? (body.reason as CloseReason)
      : null;
    if (!reason) throw new BadRequestException('Выберите причину');
    const note =
      typeof body?.note === 'string' ? maskPersonalData(body.note.trim()).text.slice(0, 300) : '';
    if (reason === 'other' && !note) throw new BadRequestException('Напишите причину');
    const t = await this.load(id);
    this.assertOpen(t);
    this.assertHolder(t, who);
    return this.storage.saveTicket(
      this.setStatus(t, 'resolved', {
        closed: {
          by: 'specialist',
          at: now(),
          reason,
          ...(note ? { note } : {}),
          name: who.name,
        },
        closeAt: null,
        remindAt: null,
      }),
    );
  }

  /** Владелец может менять только свои обращения. */
  async assertOwner(user: User, id: string) {
    const t = await this.load(id);
    if (t.ownerId !== user.id) throw new ForbiddenException('Это не ваше обращение');
    return t;
  }
}
