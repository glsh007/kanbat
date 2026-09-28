import { maskPersonalData } from '../common/pii';
import { config } from '../config';
import {
  BadRequestException,
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
  type Escalation,
  type EscalationStatus,
  type Storage,
  type Ticket,
  type User,
} from '../store/types';

const STATUSES: EscalationStatus[] = ['new', 'in_progress', 'answered', 'resolved'];
const MAX_MESSAGES = 300;
const REPLY_MAX = 4000;

const now = () => new Date().toISOString();

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
  };
}

/**
 * Обращения к специалисту. Владелец задачи присылает переписку и сводку, специалист — ответы
 * и статусы. Статус несёт ревизию: побеждает бо́льшая, при равной — то, что уже на сервере.
 */
@Injectable()
export class SupportService implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(STORAGE) private readonly storage: Storage) {}

  private sweep: ReturnType<typeof setInterval> | null = null;

  onModuleInit() {
    void this.prune();
    // раз в 6 часов; таймер не держит процесс
    this.sweep = setInterval(() => void this.prune(), 6 * 3_600_000);
    this.sweep.unref?.();
  }

  onModuleDestroy() {
    if (this.sweep) clearInterval(this.sweep);
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
    const next = theirs > ours ? escalation : prev.escalation;
    return this.storage.saveTicket({
      ...prev,
      title,
      messages: afterHandoff(body.messages, next),
      escalation: next,
      // просьба «Срочно» — решение владельца: последняя присланная (или снятая)
      urgent,
      updatedAt: now(),
    });
  }

  async mine(user: User) {
    return (await this.storage.ticketsOf(user.id)).map(clean);
  }

  async all() {
    return (await this.storage.listTickets()).map(clean);
  }

  private async load(id: string) {
    const t = await this.storage.getTicket(id);
    if (!t) throw new NotFoundException('Обращение не найдено');
    // при следующем сохранении старая переписка (если была) исчезнет и из хранилища
    return clean(t);
  }

  private setStatus(t: Ticket, status: EscalationStatus): Ticket {
    return {
      ...t,
      escalation: { ...t.escalation, status, updatedAt: now(), rev: (t.escalation.rev ?? 0) + 1 },
      updatedAt: now(),
    };
  }

  async take(specialist: User, id: string) {
    const t = await this.load(id);
    const takenBy = { id: specialist.id, name: specialist.name };
    if (t.escalation.status !== 'new') return this.storage.saveTicket({ ...t, takenBy });
    return this.storage.saveTicket({ ...this.setStatus(t, 'in_progress'), takenBy });
  }

  async reply(specialist: User, id: string, textRaw: unknown) {
    const text = typeof textRaw === 'string' ? textRaw.trim().slice(0, REPLY_MAX) : '';
    if (!text) throw new BadRequestException('Пустой ответ');
    const t = await this.load(id);
    const next = this.setStatus(t, 'answered');
    // ответил — значит, взял (если ещё никто не брал)
    next.takenBy = t.takenBy ?? { id: specialist.id, name: specialist.name };
    next.replies = [
      ...t.replies,
      { id: randomUUID(), text, authorName: specialist.name, createdAt: now() },
    ];
    return this.storage.saveTicket(next);
  }

  async resolve(id: string) {
    const t = await this.load(id);
    return this.storage.saveTicket(this.setStatus(t, 'resolved'));
  }

  /** Владелец может менять только свои обращения. */
  async assertOwner(user: User, id: string) {
    const t = await this.load(id);
    if (t.ownerId !== user.id) throw new ForbiddenException('Это не ваше обращение');
    return t;
  }
}
