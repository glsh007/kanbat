import { URGENCY_LABELS, type Urgency } from '@app/shared';
import { ChevronsUp, Zap } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Бейдж срочности (ТЗ v2, п. 13). Показываем только то, что требует внимания:
 * «Срочно» — заливка primary (самый заметный элемент на карточке), «Высокая» — мягкий акцент.
 * Обычную и низкую срочность не рисуем, если не попросили `showAll`.
 */
export function UrgencyBadge({
  urgency,
  showAll = false,
  className,
}: {
  urgency: Urgency;
  showAll?: boolean;
  className?: string;
}) {
  if (!showAll && (urgency === 'normal' || urgency === 'low')) return null;
  const label = URGENCY_LABELS[urgency];
  return (
    <span
      title={`Срочность: ${label.toLowerCase()}`}
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-semibold',
        urgency === 'critical' && 'border border-primary-border bg-primary text-on-primary',
        urgency === 'high' && 'bg-accent-soft text-on-accent-soft',
        (urgency === 'normal' || urgency === 'low') &&
          'border border-line-strong font-medium text-fg',
        className,
      )}
    >
      {urgency === 'critical' && <Zap size={13} aria-hidden fill="currentColor" />}
      {urgency === 'high' && <ChevronsUp size={14} aria-hidden />}
      <span>
        <span className="sr-only">Срочность: </span>
        {label}
      </span>
    </span>
  );
}
