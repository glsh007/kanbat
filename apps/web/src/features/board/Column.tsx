import {
  COLUMN_HINTS,
  COLUMN_LABELS,
  columnIndex,
  URGENCY_ORDER,
  type ColumnId,
  type Task,
} from '@app/shared';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CalendarClock, ChevronDown, LayoutGrid, Maximize2 } from 'lucide-react';
import { useMemo, type CSSProperties } from 'react';
import { Logo } from '@/brand/Logo';
import { cn } from '@/lib/cn';
import { columnDropId } from './dndIds';
import { NewTaskComposer } from './NewTaskComposer';
import { SortableTaskCard } from './SortableTaskCard';
import { TaskCard, type CardActions } from './TaskCard';

/** Цветная верхняя граница: градиент готовности «теплеет» от Черновика к Готово. */
const topBorder: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'border-t-col-1',
  2: 'border-t-col-2',
  3: 'border-t-col-3',
  4: 'border-t-col-4',
  5: 'border-t-col-5',
};

type Props = {
  column: ColumnId;
  tasks: Task[];
  scheduled?: Task[];
  actionsFor: (task: Task) => CardActions;
  onCreate?: (text: string, send: boolean) => void;
  collapsed: boolean;
  onToggle: () => void;
  boardDragging: boolean;
  /** «Показать все»: открыть столбец на всю доску. */
  onShowAll: () => void;
  /** Ширина на широком экране (px) — постоянная, не зависит от открытого чата. */
  width?: number | null;
};

/** С какого количества карточки становятся компактными и сколько видно в свёрнутом столбце. */
export const COMPACT_FROM = 5;
export const VISIBLE_LIMIT = 5;

/** Что показать первым в свёрнутом столбце: ждёт ответа / ошибка, затем по срочности. */
const attention = (t: Task) =>
  (t.status === 'awaiting_user' || t.status === 'error' ? 0 : 10) + URGENCY_ORDER[t.urgency];

function EmptyColumn({ column }: { column: ColumnId }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 pt-4 pb-6 text-center md:pt-8">
      <Logo variant="mark" tone="mono" size={28} decorative className="text-fg-muted opacity-50" />
      <p className="text-sm text-fg-muted">{COLUMN_HINTS[column]}</p>
    </div>
  );
}

/**
 * Столбец доски. На desktop — колонка; на mobile (< 768 px) — сворачиваемая секция
 * со счётчиком. Весь столбец — зона сброса, поэтому карточку можно бросить и на заголовок
 * свёрнутой секции.
 */
export function Column({
  column,
  tasks,
  scheduled = [],
  actionsFor,
  onCreate,
  collapsed,
  onToggle,
  boardDragging,
  onShowAll,
  width = null,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnDropId(column),
    data: { type: 'column', column },
  });
  const headingId = `col-${column}`;
  const bodyId = `col-body-${column}`;
  const count = tasks.length + scheduled.length;
  const empty = count === 0;
  const compact = tasks.length >= COMPACT_FROM;
  const overflow = tasks.length > VISIBLE_LIMIT;
  const listId = `col-list-${column}`;

  // Свёрнутый переполненный столбец: видны самые важные карточки, остальные — по «Показать все» (столбец на всю доску)
  const visible = useMemo(() => {
    if (!overflow || boardDragging) return tasks;
    return tasks
      .map((t, i) => ({ t, i }))
      .sort((a, b) => attention(a.t) - attention(b.t) || a.i - b.i)
      .slice(0, VISIBLE_LIMIT)
      .map((x) => x.t);
  }, [tasks, overflow, boardDragging]);
  const hidden = tasks.length - visible.length;

  const counter = (
    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-surface px-2 text-xs font-medium text-fg tabular-nums">
      <span className="sr-only">Задач: </span>
      {count}
    </span>
  );

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      className={cn(
        'flex flex-col rounded-panel border border-t-4 border-line bg-column backdrop-blur-[1.5px]',
        'transition-[box-shadow] duration-200',
        topBorder[columnIndex(column)],
        'md:w-[272px] md:shrink-0 md:snap-start',
        width === null ? 'xl:w-auto xl:min-w-[200px] xl:flex-1' : 'xl:w-(--col-w)',
        isOver && 'shadow-raised',
      )}
      style={width === null ? undefined : ({ '--col-w': `${width}px` } as CSSProperties)}
    >
      {/* mobile: заголовок — кнопка сворачивания */}
      <h2 className="md:hidden">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          className="flex h-12 w-full items-center gap-2 rounded-t-panel px-4 text-left text-[15px] text-heading"
        >
          <span className="flex-1">{COLUMN_LABELS[column]}</span>
          {counter}
          <ChevronDown
            size={18}
            aria-hidden
            className={cn(
              'text-fg-muted transition-transform duration-200',
              collapsed && '-rotate-90',
            )}
          />
        </button>
      </h2>
      {/* desktop: обычный заголовок */}
      <header className="hidden items-center gap-2 px-4 pt-3 pb-2 md:flex">
        <h2 id={headingId} className="min-w-0 flex-1 text-[15px] text-heading">
          {overflow ? (
            // Нажатие на заголовок переполненного столбца открывает его на всю доску
            <button
              type="button"
              onClick={onShowAll}
              aria-haspopup="true"
              title="Показать все обращения столбца"
              className="inline-flex max-w-full items-center gap-1 rounded-[6px] text-left hover:underline hover:decoration-line-strong hover:underline-offset-4"
            >
              <span className="truncate">{COLUMN_LABELS[column]}</span>
              <Maximize2 size={14} aria-hidden className="shrink-0 text-fg-muted" />
            </button>
          ) : (
            COLUMN_LABELS[column]
          )}
        </h2>
        {counter}
      </header>

      <div
        id={bodyId}
        className={cn('flex-col gap-2 px-3 pb-3', collapsed ? 'hidden md:flex' : 'flex')}
      >
        {onCreate && <NewTaskComposer onCreate={onCreate} />}

        {column === 'draft' &&
          (scheduled.length === 0 ? (
            <div className="flex items-center gap-2 rounded-control border border-dashed border-line-strong px-3 py-2 text-sm text-fg-muted">
              <CalendarClock size={16} aria-hidden />
              <span>Запланировано: 0</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2 rounded-card border border-dashed border-line-strong p-2">
              <h3 className="flex items-center gap-2 px-1 text-sm font-medium text-fg-muted">
                <CalendarClock size={16} aria-hidden />
                Запланировано · {scheduled.length}
              </h3>
              <ul className="flex flex-col gap-2">
                {scheduled.map((t) => (
                  <li key={t.id}>
                    <TaskCard task={t} actions={actionsFor(t)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}

        <SortableContext
          id={column}
          items={visible.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul
            id={listId}
            className={cn('flex min-h-2 flex-col', compact ? 'gap-1.5' : 'gap-2')}
            aria-label={`Задачи: ${COLUMN_LABELS[column]}`}
          >
            {visible.map((t) => (
              <SortableTaskCard
                key={t.id}
                task={t}
                actions={actionsFor(t)}
                boardDragging={boardDragging}
                compact={compact}
              />
            ))}
          </ul>
        </SortableContext>

        {overflow && !boardDragging && (
          <button
            type="button"
            onClick={onShowAll}
            className="flex h-10 items-center justify-center gap-1.5 rounded-control border border-dashed border-line-strong text-sm font-medium text-heading transition-colors duration-200 hover:bg-surface"
          >
            <LayoutGrid size={16} aria-hidden />
            Показать все · {tasks.length}
            <span className="sr-only">
              {' '}
              (столбец «{COLUMN_LABELS[column]}», скрыто {hidden})
            </span>
          </button>
        )}

        {empty && !boardDragging && <EmptyColumn column={column} />}
      </div>
    </section>
  );
}
