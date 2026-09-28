import { COLUMN_LABELS, columnIndex, type ColumnId, type Task } from '@app/shared';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { fieldClass } from '@/components/ui/Field';
import { IconButton } from '@/components/ui/IconButton';
import { cn } from '@/lib/cn';
import { safeStorage } from '@/lib/storage';
import { TaskCard, type CardActions } from './TaskCard';

/** Просьба «Срочно» самого человека — выше (ТЗ v4.16); оценку ИИ человеку не показываем. */
const urgentFirst = (a: Task, b: Task) => Number(!!b.urgentRequest) - Number(!!a.urgentRequest);

export type SortMode = 'new' | 'old' | 'urgency' | 'attention';

const SORTS: { id: SortMode; label: string }[] = [
  { id: 'new', label: 'Сначала новые' },
  { id: 'old', label: 'Сначала старые' },
  { id: 'urgency', label: 'Сначала «Срочно»' },
  { id: 'attention', label: 'Сначала ждут ответа' },
];

const SORT_KEY = 'kc-column-sort';

function readSort(): SortMode {
  const v = safeStorage.get(SORT_KEY);
  return SORTS.some((s) => s.id === v) ? (v as SortMode) : 'new';
}

const byNew = (a: Task, b: Task) => b.createdAt.localeCompare(a.createdAt);
const needsYou = (t: Task) => (t.status === 'awaiting_user' || t.status === 'error' ? 0 : 1);

function sortTasks(tasks: Task[], mode: SortMode): Task[] {
  const list = [...tasks];
  switch (mode) {
    case 'old':
      return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case 'urgency':
      return list.sort((a, b) => urgentFirst(a, b) || byNew(a, b));
    case 'attention':
      return list.sort((a, b) => needsYou(a) - needsYou(b) || urgentFirst(a, b) || byNew(a, b));
    default:
      return list.sort(byNew);
  }
}

const topBorder: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'border-t-col-1',
  2: 'border-t-col-2',
  3: 'border-t-col-3',
  4: 'border-t-col-4',
  5: 'border-t-col-5',
};

const timeFmt = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

type Props = {
  column: ColumnId;
  tasks: Task[];
  actionsFor: (task: Task) => CardActions;
  onClose: () => void;
};

/**
 * «Показать все»: один столбец на всю доску, обращения плиткой слева направо —
 * как файлы в проводнике. По умолчанию сначала новые; сортировка запоминается.
 * Esc или «←» — обратно к доске.
 */
export function ColumnFullView({ column, tasks, actionsFor, onClose }: Props) {
  const [sort, setSort] = useState<SortMode>(readSort);
  const sorted = useMemo(() => sortTasks(tasks, sort), [tasks, sort]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const selectId = useId();

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <motion.section
      aria-labelledby={`${selectId}-h`}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || e.defaultPrevented) return;
        if ((e.target as HTMLElement).closest('[role="dialog"], [role="menu"], select')) return;
        onClose();
      }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
      className="scroll-paper md:h-full md:overflow-auto"
    >
      <div
        className={cn(
          'm-3 flex min-h-[calc(100%-1.5rem)] flex-col rounded-panel border border-t-4 border-line bg-column backdrop-blur-[1.5px] sm:m-4 lg:m-6 lg:min-h-[calc(100%-3rem)]',
          topBorder[columnIndex(column)],
        )}
      >
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 pt-3 pb-2 sm:px-4">
          <IconButton
            label="Назад ко всем столбцам"
            icon={<ArrowLeft size={20} />}
            onClick={onClose}
            size="sm"
          />
          <h2
            id={`${selectId}-h`}
            ref={headingRef}
            tabIndex={-1}
            className="flex min-w-0 flex-1 items-center gap-2 text-lg text-heading outline-none"
          >
            <span className="truncate">{COLUMN_LABELS[column]}</span>
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-surface px-2 text-xs font-medium text-fg tabular-nums">
              <span className="sr-only">Обращений: </span>
              {tasks.length}
            </span>
          </h2>
          <label htmlFor={selectId} className="sr-only">
            Сортировка
          </label>
          <select
            id={selectId}
            value={sort}
            onChange={(e) => {
              const v = e.target.value as SortMode;
              setSort(v);
              safeStorage.set(SORT_KEY, v);
            }}
            // на телефоне — во всю ширину отдельной строкой, на широком экране — компактно справа
            className={cn(fieldClass.replace('w-full', ''), 'h-9 w-full text-sm sm:w-56')}
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </header>

        {sorted.length === 0 ? (
          <p className="px-4 pb-6 text-sm text-fg-muted">В этом столбце пока пусто.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 px-3 pb-4 sm:grid-cols-2 sm:px-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {sorted.map((t) => (
              <motion.li
                key={t.id}
                layout="position"
                transition={{ duration: 0.25 }}
                className="flex flex-col"
              >
                <TaskCard task={t} actions={actionsFor(t)} compact />
                <time dateTime={t.createdAt} className="mt-1 px-1 text-xs text-fg-muted">
                  создано {timeFmt.format(new Date(t.createdAt))}
                </time>
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </motion.section>
  );
}
