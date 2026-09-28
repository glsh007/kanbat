import { COLUMN_LABELS, COLUMNS, columnIndex, type ColumnId } from '@app/shared';
import { cn } from '@/lib/cn';

/** Путь обращения из 5 точек — «где сейчас моя заявка», как трекинг посылки (ТЗ, пп. 4, 3). */
export function StageTrack({ column }: { column: ColumnId }) {
  const current = columnIndex(column);
  return (
    <ol className="flex items-center gap-1" aria-label={`Этап: ${COLUMN_LABELS[column]}`}>
      {COLUMNS.map((c, i) => {
        const n = i + 1;
        return (
          <li key={c} className="flex items-center gap-1" title={COLUMN_LABELS[c]}>
            {i > 0 && (
              <span
                aria-hidden
                className={cn('h-px w-3 sm:w-4', n <= current ? 'bg-accent' : 'bg-line')}
              />
            )}
            <span
              aria-current={n === current ? 'step' : undefined}
              className={cn(
                'block rounded-full transition-all duration-300',
                n === current
                  ? 'size-2.5 bg-primary ring-2 ring-accent ring-offset-1 ring-offset-canvas'
                  : n < current
                    ? 'size-2 bg-accent'
                    : 'size-2 border border-line-strong',
              )}
            />
            <span className="sr-only">
              {COLUMN_LABELS[c]}
              {n === current ? ' — сейчас' : n < current ? ' — пройдено' : ''}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
