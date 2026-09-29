import { ESCALATION_LABELS, type EscalationStatus, type Ticket } from '@app/shared';
import { AlarmClock, Clock, Hand, Undo2 } from 'lucide-react';
import { motion } from 'motion/react';
import { Logo } from '@/brand/Logo';
import { UrgencyBadge } from '@/components/ui/UrgencyBadge';
import { UrgentMark } from '@/components/ui/UrgentMark';
import { cn } from '@/lib/cn';
import { useNow } from '@/lib/useNow';
import { useSupportTimers } from './tickets';
import {
  agoLabel,
  closedLabel,
  holderLabel,
  leftLabel,
  returnedLabel,
  type Viewer,
  LONG_WAIT_MIN,
  minutesSince,
  queueColumns,
  useQueue,
  waitLabel,
  type Queue,
  type SupportSort,
} from './data';

const TOP: Record<EscalationStatus, string> = {
  new: 'border-t-col-1',
  in_progress: 'border-t-col-3',
  answered: 'border-t-col-4',
  resolved: 'border-t-col-5',
};
const HINT: Record<EscalationStatus, string> = {
  new: 'Сюда попадают заявки, которые ИИ передал со сводкой',
  in_progress: 'Заявки, принятые в работу',
  answered: 'Ответили — ждём, помогло ли. Молчание — закроется само',
  resolved: 'Закрывает пользователь («Закрыть вопрос») или срок',
};

function SupportCard({
  ticket: task,
  onOpen,
  active,
  meId,
}: {
  ticket: Ticket;
  onOpen: () => void;
  active: boolean;
  meId: string | null;
}) {
  const now = useNow();
  const { returnHours } = useSupportTimers();
  const holder = holderLabel(task, meId);
  const back = returnedLabel(task, returnHours);
  const e = task.escalation!;
  const section = `от ${task.ownerName}`;
  // давно ждёт: ещё никто не ответил, а прошло больше LONG_WAIT_MIN минут
  const waiting = e.status === 'new' || e.status === 'in_progress';
  const long = waiting && minutesSince(e.createdAt, now) >= LONG_WAIT_MIN;
  return (
    <motion.li
      layout="position"
      layoutId={`sup-${task.id}`}
      transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
    >
      <article
        className={cn(
          'relative flex flex-col gap-2 rounded-card border bg-surface p-3 shadow-card',
          active
            ? 'border-accent ring-2 ring-accent/50'
            : e.handoff.urgency === 'critical' || long
              ? 'border-accent'
              : 'border-line',
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <UrgencyBadge urgency={e.handoff.urgency} showAll />
          {task.urgent && <UrgentMark reason={task.urgent.reason} forSpecialist />}
          {waiting && long && (
            <span className="inline-flex h-6 items-center gap-1 rounded-full bg-accent-soft px-2 text-xs font-medium text-on-accent-soft">
              <AlarmClock size={13} aria-hidden />
              ждёт {waitLabel(e.createdAt, now)}
            </span>
          )}
          {waiting && !long && (
            <span
              className="inline-flex items-center gap-1 text-xs text-fg-muted"
              title="Сколько ждёт с момента передачи"
            >
              <Clock size={13} aria-hidden />
              ждёт {waitLabel(e.createdAt, now)}
            </span>
          )}
          {e.status === 'answered' && (
            <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
              <Clock size={13} aria-hidden />
              ответили {agoLabel(e.updatedAt, now)}
              {e.closeAt && ` · закроется ${leftLabel(e.closeAt, now)}`}
            </span>
          )}
        </div>
        <h3 className="text-[15px] leading-snug font-medium text-heading">
          <button
            type="button"
            onClick={onOpen}
            className="text-left after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-focus"
          >
            {task.title}
          </button>
        </h3>
        <p className="line-clamp-2 text-sm text-fg-muted">
          {e.handoff.hypothesis || e.handoff.original}
        </p>
        <p className="text-xs text-fg-muted">
          {e.handoff.service}
          {section && ` · ${section}`}
        </p>
        {back && (
          <p className="flex items-center gap-1 text-xs font-medium text-heading">
            <Undo2 size={12} aria-hidden />
            {back}
          </p>
        )}
        {e.status === 'resolved' ? (
          <p className="text-xs text-fg-muted">{closedLabel(task)}</p>
        ) : (
          holder && (
            <p className="flex items-center gap-1 text-xs text-fg-muted">
              <Hand size={12} aria-hidden />
              {holder}
            </p>
          )
        )}
      </article>
    </motion.li>
  );
}

/**
 * Доска пульта поддержки (ТЗ v4.4, п. 14): столбцы по статусам для очереди.
 * «Все» — четыре столбца, «Мои» — три (новых среди взятых нет), очередь одного статуса —
 * один столбец во всю ширину плиткой.
 */
export function SupportBoard({
  activeId,
  onOpen,
  queue,
  sort,
  me,
}: {
  activeId?: string;
  onOpen: (id: string) => void;
  queue: Queue;
  sort: SupportSort;
  me: Viewer;
}) {
  const by = useQueue(queue, sort, me);
  const columns = queueColumns(queue);
  const single = columns.length === 1;
  return (
    <div className="scroll-paper md:h-full md:overflow-auto">
      <div
        className={cn(
          'flex flex-col gap-3 p-3 sm:p-4 lg:p-6',
          !single && 'md:min-h-full md:w-max md:flex-row md:items-stretch xl:w-auto',
          single && 'md:min-h-full',
        )}
      >
        {columns.map((s) => (
          <section
            key={s}
            aria-labelledby={`sup-col-${s}`}
            className={cn(
              'flex flex-col rounded-panel border border-t-4 border-line bg-column backdrop-blur-[1.5px]',
              TOP[s],
              single
                ? 'md:flex-1'
                : 'md:w-[280px] md:shrink-0 xl:w-auto xl:min-w-[220px] xl:flex-1',
            )}
          >
            <header className="flex items-center gap-2 px-4 pt-3 pb-2">
              <h2 id={`sup-col-${s}`} className="flex-1 text-[15px] text-heading">
                {ESCALATION_LABELS[s]}
              </h2>
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-surface px-2 text-xs font-medium text-fg tabular-nums">
                <span className="sr-only">Заявок: </span>
                {by[s].length}
              </span>
            </header>
            <ul
              className={cn(
                'gap-2 px-3 pb-3',
                single
                  ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'
                  : 'flex flex-col',
              )}
            >
              {by[s].map((t) => (
                <SupportCard
                  key={t.id}
                  ticket={t}
                  active={t.id === activeId}
                  meId={me.id}
                  onOpen={() => onOpen(t.id)}
                />
              ))}
            </ul>
            {by[s].length === 0 && (
              <div className="flex flex-col items-center gap-2 px-4 pt-2 pb-6 text-center">
                <Logo
                  variant="mark"
                  tone="mono"
                  size={28}
                  decorative
                  className="text-fg-muted opacity-50"
                />
                <p className="text-sm text-fg-muted">{HINT[s]}</p>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
