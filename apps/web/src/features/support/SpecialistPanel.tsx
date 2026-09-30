import {
  ESCALATION_LABELS,
  messagesForSpecialist,
  type Message,
  type SpecialistRef,
} from '@app/shared';
import { isSendKey, SEND_HINT } from '@/lib/keys';
import { ArrowLeft, Check, Flag, Hand, Lock, Send, Undo2, X, XCircle } from 'lucide-react';
import { NavArrows } from '@/layout/NavArrows';
import { motion } from 'motion/react';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Button } from '@/components/ui/Button';
import { fieldClass } from '@/components/ui/Field';
import { IconButton } from '@/components/ui/IconButton';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { UrgencyBadge } from '@/components/ui/UrgencyBadge';
import { UrgentMark } from '@/components/ui/UrgentMark';
import { cn } from '@/lib/cn';
import { usePanelWidth } from '@/lib/panelWidth';
import { useNow } from '@/lib/useNow';
import { CopyHandoff, HandoffSummary } from './HandoffSummary';
import { serverApi } from '@/lib/api';
import { useUser } from '@/lib/session';
import { CloseTicketDialog } from './CloseTicketDialog';
import { agoLabel, closedLabel, holderLabel, leftLabel, returnedLabel } from './data';
import { specialist, useSupportTimers, useTickets } from './tickets';

const timeFmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

/**
 * Заявка на пульте специалиста (ТЗ v4.4, п. 14): сводка из 6 пунктов от ИИ, переписка
 * с пользователем после передачи, ответ, «Принять в работу», «Вернуть в общую очередь»,
 * «Закрыть без решения»; администратор — «Передать» (ТЗ v4.22). Решённой заявку делает только
 * пользователь («Закрыть вопрос») или срок — «Отметить решённым» у специалиста нет.
 * Разговор пользователя с ИИ специалисту не показывается — только сводка.
 * `side` — панель справа от доски, `main` — правая часть режима «Чат».
 */
export function SpecialistPanel({
  taskId,
  onClose,
  layout = 'side',
}: {
  taskId: string;
  onClose: () => void;
  layout?: 'side' | 'main';
}) {
  const task = useTickets((s) => s.tickets.find((t) => t.id === taskId));
  const loaded = useTickets((s) => s.loaded);
  const messages = task?.messages as Message[] | undefined;
  // доска: заявка открывается поверх столбцов, ширина — за левый край (ТЗ v4.18–v4.20)
  const panelW = usePanelWidth('ticket-panel', 560, 420, 1400);
  const panelStyle = { '--panel-w': `${panelW.width}px` } as CSSProperties;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const seen = useRef<number | null>(null);
  const now = useNow();
  const me = useUser();
  const admin = me?.admin === true;
  const timers = useSupportTimers();
  const [closing, setClosing] = useState(false);
  const [people, setPeople] = useState<SpecialistRef[]>([]);
  const assignId = useId();

  // администратору — список специалистов для «Передать»
  useEffect(() => {
    if (!admin) return;
    let alive = true;
    serverApi
      .specialists()
      .then((list) => alive && setPeople(list))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [admin]);

  /** Действие специалиста на сервере; ошибку показываем под кнопками. */
  const act = async (run: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await run();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  // при открытии — сверху, со сводкой; пришло новое сообщение — плавно к нему, как в мессенджере
  const threadCount = task
    ? messagesForSpecialist((task.messages ?? []) as Message[], task.escalation).length +
      task.replies.length
    : 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (el && seen.current !== null && threadCount > seen.current)
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    seen.current = threadCount;
  }, [threadCount]);

  if (!task) {
    if (!loaded) return null;
    return (
      <aside
        style={panelStyle}
        className={cn(
          'fixed inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-canvas p-6 text-center',
          layout === 'side'
            ? 'lg:absolute lg:inset-y-0 lg:right-0 lg:left-auto lg:z-20 lg:w-[min(var(--panel-w),calc(100%-3rem))] lg:border-l lg:border-line lg:shadow-raised'
            : 'lg:static lg:min-w-0 lg:flex-1',
        )}
      >
        <p className="text-fg-muted">Заявка не найдена — возможно, пользователь удалил аккаунт.</p>
        <Button variant="secondary" onClick={onClose}>
          К заявкам
        </Button>
      </aside>
    );
  }
  const e = task.escalation;
  const mine = !!task.takenBy && task.takenBy.id === me?.id;
  // заявку ведёт другой — отвечать и закрывать может он или администратор (ТЗ v4.22)
  const canAct = !task.takenBy || mine || admin;
  const back = returnedLabel(task, timers.returnHours);
  // только сообщения пользователя после передачи (старые заявки могли хранить больше)
  const after = messagesForSpecialist(messages ?? [], e);

  // сообщения пользователя после передачи и ответы специалистов — одной лентой
  const thread = [
    ...after.map((m) => ({ id: m.id, at: m.createdAt, text: m.content, mine: false, author: '' })),
    ...task.replies.map((r) => ({
      id: r.id,
      at: r.createdAt,
      text: r.text,
      mine: true,
      author: r.authorName,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const send = () => {
    const clean = text.trim();
    if (!clean || busy) return;
    void act(async () => {
      await specialist.reply(task.id, clean);
      setText('');
    });
  };

  return (
    <motion.aside
      aria-label={`Заявка: ${task.title}`}
      onKeyDown={(ev) => {
        if (ev.key === 'Escape' && !(ev.target as HTMLElement).closest('textarea')) onClose();
      }}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: [0.2, 0.7, 0.2, 1] }}
      style={panelStyle}
      className={cn(
        'fixed inset-0 z-30 flex flex-col bg-canvas',
        layout === 'side'
          ? // доска: поверх столбцов — доска не сужается и не сдвигается
            'lg:absolute lg:inset-y-0 lg:right-0 lg:left-auto lg:z-20 lg:w-[min(var(--panel-w),calc(100%-3rem))] lg:border-l lg:border-line lg:shadow-raised'
          : 'lg:static lg:z-auto lg:min-w-0 lg:flex-1',
      )}
    >
      {layout === 'side' && <ResizeHandle panel={panelW} edge="left" label="Ширина окна заявки" />}
      <header className="flex flex-col gap-2 border-b border-line px-2 pt-2 pb-3 sm:px-4">
        <div className="flex items-start gap-1">
          <IconButton
            label="Назад к заявкам"
            icon={<ArrowLeft size={20} />}
            onClick={onClose}
            className="lg:hidden"
          />
          <h2 className="min-w-0 flex-1 pt-1.5 pl-1 font-serif text-xl leading-snug">
            {task.title}
          </h2>
          {/* на телефоне заявка — на весь экран поверх шапки: стрелки Канбата — здесь */}
          <NavArrows className="lg:hidden" />
          {layout === 'side' && (
            <div className="hidden lg:flex">
              <IconButton label="Закрыть" icon={<X size={20} />} onClick={onClose} size="sm" />
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-1 text-sm text-fg-muted">
          <span title="Оценка срочности ИИ по тексту обращения" className="inline-flex">
            <UrgencyBadge urgency={e.handoff.urgency} showAll />
          </span>
          {task.urgent && <UrgentMark reason={task.urgent.reason} forSpecialist />}
          <span>{e.status === 'resolved' ? 'Закрыта' : ESCALATION_LABELS[e.status]}</span>
          <span>передано {agoLabel(e.createdAt, now)}</span>
          <span>· от {task.ownerName}</span>
          {task.takenBy && <span>· {holderLabel(task, me?.id ?? null)}</span>}
          <span>· {e.reason}</span>
        </div>
      </header>

      <div ref={scrollRef} className="scroll-paper min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-5">
          {task.urgent && (
            <p className="flex items-start gap-2 rounded-card border border-line-strong bg-surface px-4 py-3 text-sm">
              <Flag size={16} aria-hidden className="mt-0.5 shrink-0" />
              <span>
                <span className="font-medium text-heading">Пользователь просит срочно:</span> «
                {task.urgent.reason}» · {agoLabel(task.urgent.at, now)}
                <span className="block text-fg-muted">
                  Это просьба пользователя — очередь и сроки она не меняет.
                </span>
              </span>
            </p>
          )}
          {task.archived && (
            <p className="rounded-card border border-line bg-sunken px-4 py-3 text-sm text-fg-muted">
              Переписка удалена по сроку хранения (после решения прошло больше 90 дней) — осталась
              сводка.
            </p>
          )}
          <section
            className="rounded-card border border-line bg-surface p-4"
            aria-labelledby="handoff-h"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 id="handoff-h" className="text-base font-semibold text-heading">
                Сводка от ИИ-помощника
              </h3>
              <CopyHandoff handoff={e.handoff} title={task.title} />
            </div>
            <HandoffSummary handoff={e.handoff} />
            <p className="mt-3 flex items-start gap-2 border-t border-line pt-3 text-xs text-fg-muted">
              <Lock size={14} aria-hidden className="mt-px shrink-0" />
              Разговор пользователя с ИИ остаётся у него — здесь только сводка. Нужны детали —
              спросите в ответе.
            </p>
          </section>

          <section className="flex flex-col gap-2" aria-labelledby="thread-h">
            <h3 id="thread-h" className="text-sm font-semibold text-heading">
              Переписка с пользователем
            </h3>
            {thread.length === 0 ? (
              <p className="text-sm text-fg-muted">
                {e.status === 'resolved'
                  ? 'Сообщений после передачи не было.'
                  : 'Пока тихо. Напишите пользователю — ответ придёт в его чат.'}
              </p>
            ) : (
              <ol className="flex flex-col gap-2">
                {thread.map((m) => (
                  <li
                    key={m.id}
                    className={cn(
                      'max-w-[90%] rounded-card px-3.5 py-2.5 whitespace-pre-wrap',
                      m.mine
                        ? 'self-end border border-line bg-surface'
                        : 'self-start bg-accent-soft text-on-accent-soft',
                    )}
                  >
                    <span className={cn('mb-0.5 block text-xs', m.mine && 'text-fg-muted')}>
                      {m.mine
                        ? // ответы разных специалистов: «Вы» — только свои (ТЗ v4.22)
                          m.author === me?.name
                          ? `Вы (${m.author})`
                          : `${m.author}, специалист`
                        : task.ownerName}{' '}
                      · {timeFmt.format(new Date(m.at))}
                    </span>
                    {m.text}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>

      <div className="border-t border-line px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          {e.status === 'resolved' ? (
            <p className="flex items-center gap-2 text-sm text-fg-muted">
              <Check size={16} aria-hidden /> Заявка закрыта: {closedLabel(task)}.
            </p>
          ) : (
            <>
              {back && (
                <p className="flex items-center gap-2 text-sm font-medium text-heading">
                  <Undo2 size={16} aria-hidden /> {back}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {!task.takenBy && (
                  <Button
                    size="sm"
                    icon={<Hand size={16} />}
                    disabled={busy}
                    onClick={() => void act(() => specialist.take(task.id))}
                  >
                    Принять в работу
                  </Button>
                )}
                {task.takenBy && (mine || admin) && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Undo2 size={16} />}
                    disabled={busy}
                    onClick={() => void act(() => specialist.release(task.id))}
                  >
                    Вернуть в общую очередь
                  </Button>
                )}
                {canAct && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<XCircle size={16} />}
                    disabled={busy}
                    onClick={() => {
                      setError(null);
                      setClosing(true);
                    }}
                  >
                    Закрыть без решения
                  </Button>
                )}
                {admin && people.length > 0 && (
                  <span className="flex items-center gap-2">
                    <label htmlFor={assignId} className="text-sm text-fg-muted">
                      Ведёт
                    </label>
                    <select
                      id={assignId}
                      value={task.takenBy?.id ?? ''}
                      disabled={busy}
                      onChange={(ev) =>
                        void act(() => specialist.assign(task.id, ev.target.value || null))
                      }
                      className={cn(fieldClass.replace('w-full', ''), 'h-9 w-auto text-sm')}
                    >
                      <option value="">— общая очередь —</option>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.id === me?.id ? `${p.name} (вы)` : p.name}
                        </option>
                      ))}
                    </select>
                  </span>
                )}
              </div>
              {!canAct ? (
                <p className="rounded-card border border-line bg-sunken px-3 py-2 text-sm">
                  Заявку ведёт {task.takenBy?.name} — отвечает он(а). Передать заявку другому может
                  администратор.
                </p>
              ) : (
                <>
                  <form
                    className="flex items-end gap-2"
                    onSubmit={(ev) => {
                      ev.preventDefault();
                      send();
                    }}
                  >
                    <label htmlFor={fieldId} className="sr-only">
                      Ответ пользователю
                    </label>
                    <textarea
                      id={fieldId}
                      rows={2}
                      value={text}
                      onChange={(ev) => setText(ev.target.value)}
                      onKeyDown={(ev) => {
                        if (isSendKey(ev)) {
                          ev.preventDefault();
                          send();
                        }
                      }}
                      placeholder="Ответ пользователю: что сделали или что ему сделать…"
                      className={cn(fieldClass, 'min-h-11 flex-1 resize-none py-2 text-sm')}
                    />
                    <Button type="submit" icon={<Send size={16} />} disabled={!text.trim() || busy}>
                      Ответить
                    </Button>
                  </form>
                  {error && (
                    <p role="alert" className="text-sm font-medium text-heading">
                      {error}
                    </p>
                  )}
                  <p className="text-xs text-fg-muted">
                    {e.status === 'answered' && e.closeAt
                      ? `Ждём пользователя: если он не ответит, заявка закроется сама ${leftLabel(e.closeAt, now)}. `
                      : `Ответ придёт в чат пользователя. Если он не ответит ${timers.closeHours} ч — заявка закроется сама. `}
                    {SEND_HINT}.
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </div>
      <CloseTicketDialog
        open={closing}
        busy={busy}
        error={closing ? error : null}
        onClose={() => setClosing(false)}
        onConfirm={(reason, note) =>
          void act(() => specialist.close(task.id, reason, note)).then(
            (done) => done && setClosing(false),
          )
        }
      />
    </motion.aside>
  );
}
