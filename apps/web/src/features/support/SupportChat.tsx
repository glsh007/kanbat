import { ESCALATION_LABELS, type Ticket } from '@app/shared';
import { ChevronDown } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { Logo } from '@/brand/Logo';
import { ListEdge } from '@/components/ui/ResizeHandle';
import { UrgencyBadge } from '@/components/ui/UrgencyBadge';
import { UrgentMark } from '@/components/ui/UrgentMark';
import { cn } from '@/lib/cn';
import { usePanelWidth } from '@/lib/panelWidth';
import { useNow } from '@/lib/useNow';
import {
  agoLabel,
  holderLabel,
  type Viewer,
  LONG_WAIT_MIN,
  minutesSince,
  queueInfo,
  ticketPath,
  useQueue,
  waitLabel,
  type Queue,
  type SupportSort,
} from './data';
import { SpecialistPanel } from './SpecialistPanel';

/** Строка заявки в списке режима «Чат» — как диалог в мессенджере. */
function TicketRow({
  t,
  queue,
  active,
  meId,
}: {
  t: Ticket;
  queue: Queue;
  active: boolean;
  meId: string | null;
}) {
  const now = useNow();
  const e = t.escalation;
  const waiting = e.status === 'new' || e.status === 'in_progress';
  const long = waiting && minutesSince(e.createdAt, now) >= LONG_WAIT_MIN;
  // точка — заявка ждёт специалиста (новая или давно без ответа)
  const attention = e.status === 'new' || long;
  const meta =
    e.status === 'answered'
      ? `ответили ${agoLabel(e.updatedAt, now)}`
      : e.status === 'resolved'
        ? 'закрыта'
        : `ждёт ${waitLabel(e.createdAt, now)}`;
  const holder = holderLabel(t, meId);
  return (
    <li>
      <Link
        to={ticketPath(queue, t.id)}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'flex gap-3 rounded-card px-3 py-2.5 transition-colors duration-200',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
          active ? 'bg-surface shadow-card ring-1 ring-line' : 'hover:bg-surface/70',
        )}
      >
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-on-accent-soft"
        >
          {t.ownerName.trim().charAt(0).toUpperCase() || '?'}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2 text-xs text-fg-muted">
            <span className="min-w-0 truncate font-medium text-fg">{t.ownerName}</span>
            <span className={cn('ml-auto shrink-0', long && 'font-medium text-heading')}>
              {meta}
            </span>
          </span>
          <span className="flex items-start gap-2">
            <span
              className={cn(
                'line-clamp-2 min-w-0 flex-1 text-[15px] leading-snug',
                attention ? 'font-medium text-heading' : 'text-fg',
              )}
            >
              {t.title}
            </span>
            {attention && (
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary">
                <span className="sr-only">{e.status === 'new' ? 'Новая' : 'Давно ждёт'}</span>
              </span>
            )}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
            <UrgencyBadge urgency={e.handoff.urgency} />
            {t.urgent && <UrgentMark reason={t.urgent.reason} forSpecialist />}
            <span>{ESCALATION_LABELS[e.status]}</span>
            {holder && <span>· {holder}</span>}
          </span>
        </span>
      </Link>
    </li>
  );
}

function Group({
  title,
  list,
  queue,
  activeId,
  meId,
}: {
  title?: string;
  list: Ticket[];
  queue: Queue;
  activeId?: string;
  meId: string | null;
}) {
  if (list.length === 0) return null;
  return (
    <section className="flex flex-col gap-1" aria-label={title}>
      {title && (
        <h2 className="px-3 pt-2 text-xs font-medium text-fg-muted">
          {title} · {list.length}
        </h2>
      )}
      <ul className="flex flex-col gap-0.5">
        {list.map((t) => (
          <TicketRow key={t.id} t={t} queue={queue} active={t.id === activeId} meId={meId} />
        ))}
      </ul>
    </section>
  );
}

/**
 * Режим «Чат» пульта поддержки: слева заявки очереди (как диалоги в мессенджере),
 * справа — сводка ИИ и переписка с пользователем. На телефоне заявка открывается поверх списка.
 */
export function SupportChat({
  queue,
  sort,
  me,
  activeId,
  onClose,
}: {
  queue: Queue;
  sort: SupportSort;
  me: Viewer;
  activeId?: string;
  onClose: () => void;
}) {
  const by = useQueue(queue, sort, me);
  const meId = me.id;
  const [showDone, setShowDone] = useState(false);
  const listWidth = usePanelWidth('tickets', 360, 280, 640);
  const single = queueInfo(queue).status;
  const waiting = [...by.new, ...by.in_progress];
  const total = waiting.length + by.answered.length + by.resolved.length;

  return (
    <div className="flex min-h-full md:h-full">
      <div
        style={{ '--panel-w': `${listWidth.width}px` } as CSSProperties}
        className={cn(
          'scroll-paper flex w-full flex-col gap-2 p-2 sm:p-3 lg:w-[var(--panel-w)] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-line',
        )}
      >
        {total === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Logo
              variant="mark"
              tone="mono"
              size={32}
              decorative
              className="text-fg-muted opacity-50"
            />
            <p className="text-sm text-fg-muted">В этой очереди пока нет заявок.</p>
          </div>
        ) : single ? (
          <Group list={by[single]} queue={queue} activeId={activeId} meId={meId} />
        ) : (
          <>
            <Group
              title="Ждут ответа"
              list={waiting}
              queue={queue}
              activeId={activeId}
              meId={meId}
            />
            <Group
              title="Ждут пользователя"
              list={by.answered}
              queue={queue}
              activeId={activeId}
              meId={meId}
            />
            {by.resolved.length > 0 && (
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  aria-expanded={showDone}
                  onClick={() => setShowDone((v) => !v)}
                  className="flex h-9 items-center gap-1.5 rounded-control px-3 text-xs font-medium text-fg-muted transition-colors duration-200 hover:bg-surface/70 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <ChevronDown
                    size={14}
                    aria-hidden
                    className={cn('transition-transform duration-200', !showDone && '-rotate-90')}
                  />
                  Закрытые · {by.resolved.length}
                </button>
                {showDone && (
                  <Group list={by.resolved} queue={queue} activeId={activeId} meId={meId} />
                )}
              </div>
            )}
          </>
        )}
      </div>
      <ListEdge panel={listWidth} label="Ширина списка заявок" />

      {activeId ? (
        <SpecialistPanel key={activeId} taskId={activeId} onClose={onClose} layout="main" />
      ) : (
        <div className="hidden min-w-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center lg:flex">
          <Logo variant="mark" size={48} decorative />
          <p className="font-serif text-xl text-heading">Выберите заявку слева</p>
          <p className="max-w-sm text-sm text-fg-muted">
            Сверху — сводка от ИИ, ниже — переписка с пользователем. Ответ придёт в его чат.
          </p>
        </div>
      )}
    </div>
  );
}
