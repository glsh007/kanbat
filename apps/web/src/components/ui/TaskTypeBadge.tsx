import {
  DIFFICULTY_LABELS,
  KIND_LEVEL,
  STRUCTURE_LABELS,
  taskKind,
  type TaskDifficulty,
  type TaskStructure,
} from '@app/shared';
import { cn } from '@/lib/cn';

export type TaskTypeBadgeProps = {
  structure: TaskStructure;
  difficulty: TaskDifficulty;
  /** Показывать букву типа (A–D) рядом с индикатором. */
  showKind?: boolean;
  className?: string;
};

/**
 * Бейдж типа задачи (ТЗ, п. 2): иконка структуры (■ чёткая / ◌ слабая)
 * и индикатор сложности из 3 делений.
 */
export function TaskTypeBadge({
  structure,
  difficulty,
  showKind = false,
  className,
}: TaskTypeBadgeProps) {
  const kind = taskKind(structure, difficulty);
  const level = KIND_LEVEL[kind];
  const label = `Тип ${kind}: ${STRUCTURE_LABELS[structure].toLowerCase()} структура, ${DIFFICULTY_LABELS[difficulty]}`;

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full bg-accent-soft px-2 text-on-accent-soft',
        className,
      )}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
        {structure === 'clear' ? (
          <rect x="1.5" y="1.5" width="9" height="9" rx="2" fill="currentColor" />
        ) : (
          <circle
            cx="6"
            cy="6"
            r="4.25"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="2.2 1.6"
          />
        )}
      </svg>
      <span className="flex items-end gap-0.5" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              'w-1 rounded-full bg-current transition-opacity duration-200',
              i <= level ? 'opacity-100' : 'opacity-25',
            )}
            style={{ height: 4 + i * 2 }}
          />
        ))}
      </span>
      {showKind && <span className="text-xs font-semibold">{kind}</span>}
    </span>
  );
}
