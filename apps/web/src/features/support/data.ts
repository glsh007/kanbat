import { URGENCY_ORDER, type EscalationStatus, type Ticket } from '@app/shared';
import {
  BellDot,
  CircleCheck,
  Hand,
  Hourglass,
  Inbox,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import { useTickets } from './tickets';

export const STATUSES: EscalationStatus[] = ['new', 'in_progress', 'answered', 'resolved'];

export function waitLabel(fromIso: string, now: number): string {
  const min = Math.max(0, Math.round((now - new Date(fromIso).getTime()) / 60_000));
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} ч ${min % 60} мин` : `${Math.floor(h / 24)} дн`;
}

/** «5 мин назад», «только что» (без «назад»). */
export function agoLabel(fromIso: string, now: number): string {
  const w = waitLabel(fromIso, now);
  return w === 'только что' ? w : `${w} назад`;
}

/** Сколько минут заявка ждёт, чтобы считать её «давно ждущей» (подсветка на пульте). */
export const LONG_WAIT_MIN = 15;

export const minutesSince = (iso: string, now: number) =>
  Math.max(0, (now - new Date(iso).getTime()) / 60_000);

export type SupportSort = 'urgency' | 'wait';
export type SupportView = 'board' | 'chat';

/**
 * Очереди пульта поддержки (ТЗ v4.4, п. 14) — пункты меню специалиста.
 * «Все» — вся доска; «Мои» — взятые мной; остальные — один статус.
 */
export type Queue = 'all' | 'new' | 'mine' | 'work' | 'waiting' | 'done';

export const QUEUES: { id: Queue; label: string; icon: LucideIcon; status?: EscalationStatus }[] = [
  { id: 'all', label: 'Все заявки', icon: Inbox },
  { id: 'new', label: 'Новые', icon: BellDot, status: 'new' },
  { id: 'mine', label: 'Мои', icon: Hand },
  { id: 'work', label: 'В работе', icon: Wrench, status: 'in_progress' },
  { id: 'waiting', label: 'Ждут пользователя', icon: Hourglass, status: 'answered' },
  { id: 'done', label: 'Решённые', icon: CircleCheck, status: 'resolved' },
];

export const isQueue = (v: unknown): v is Queue => QUEUES.some((q) => q.id === v);
export const queueInfo = (q: Queue) => QUEUES.find((x) => x.id === q)!;
export const queuePath = (q: Queue) => (q === 'all' ? '/support' : `/support/${q}`);
export const ticketPath = (q: Queue, id: string) => `${queuePath(q)}/t/${id}`;

/** Какие столбцы показывает доска для очереди. */
export function queueColumns(q: Queue): EscalationStatus[] {
  const one = queueInfo(q).status;
  if (one) return [one];
  // «Мои» — только взятые: новых среди них не бывает
  return q === 'mine' ? ['in_progress', 'answered', 'resolved'] : STATUSES;
}

export function inQueue(t: Ticket, q: Queue, meId: string | null): boolean {
  if (q === 'all') return true;
  if (q === 'mine') return !!meId && t.takenBy?.id === meId;
  return t.escalation.status === queueInfo(q).status;
}

const isOpen = (t: Ticket) => t.escalation.status !== 'resolved';

/** Счётчики для меню: открытые заявки в каждой очереди (у «Решённых» — все решённые). */
export function useQueueCounts(meId: string | null): Record<Queue, number> {
  const tickets = useTickets((s) => s.tickets);
  return useMemo(() => {
    const counts = Object.fromEntries(QUEUES.map((q) => [q.id, 0])) as Record<Queue, number>;
    for (const t of tickets)
      for (const q of QUEUES)
        if (inQueue(t, q.id, meId) && (q.id === 'done' || isOpen(t))) counts[q.id] += 1;
    return counts;
  }, [tickets, meId]);
}

/**
 * «Сначала срочные» — по срочности, затем кто дольше ждёт; «Дольше ждут» — по времени передачи.
 * Решённые — сначала недавние.
 */
export function sortTickets(list: Ticket[], sort: SupportSort): Ticket[] {
  const oldest = (a: Ticket, b: Ticket) =>
    a.escalation.createdAt.localeCompare(b.escalation.createdAt);
  return [...list].sort((a, b) => {
    const ra = a.escalation.status === 'resolved';
    const rb = b.escalation.status === 'resolved';
    if (ra !== rb) return ra ? 1 : -1;
    if (ra) return b.updatedAt.localeCompare(a.updatedAt);
    return sort === 'wait'
      ? oldest(a, b)
      : URGENCY_ORDER[a.escalation.handoff.urgency] - URGENCY_ORDER[b.escalation.handoff.urgency] ||
          oldest(a, b);
  });
}

/** Заявки очереди, разложенные по статусам и отсортированные. */
export function useQueue(q: Queue, sort: SupportSort, meId: string | null) {
  const tickets = useTickets((s) => s.tickets);
  return useMemo(() => {
    const by = Object.fromEntries(STATUSES.map((s) => [s, [] as Ticket[]])) as Record<
      EscalationStatus,
      Ticket[]
    >;
    for (const t of tickets) if (inQueue(t, q, meId)) by[t.escalation.status]?.push(t);
    for (const s of STATUSES) by[s] = sortTickets(by[s], sort);
    return by;
  }, [tickets, q, sort, meId]);
}
