import { Flag } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Пояснение к метке — одно на весь продукт: человек видит его везде, где метка. */
export const URGENT_NOTE =
  'Это ваша просьба специалисту. Метка не ускоряет ответ и не меняет очередь — специалист не обязан спешить.';

/**
 * Метка «Срочно» (ТЗ v4.16): просьба самого человека, а не оценка ИИ.
 * `forSpecialist` — подпись для пульта: «Просит срочно».
 */
export function UrgentMark({
  reason,
  forSpecialist = false,
  className,
}: {
  reason: string;
  forSpecialist?: boolean;
  className?: string;
}) {
  const hint = forSpecialist
    ? `Сотрудник просит срочно: «${reason}». Это просьба — очередь она не меняет.`
    : `Вы попросили срочно: «${reason}». ${URGENT_NOTE}`;
  return (
    <span
      title={hint}
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-full border border-line-strong px-2 text-xs font-medium text-fg',
        className,
      )}
    >
      <Flag size={12} aria-hidden />
      {forSpecialist ? 'Просит срочно' : 'Срочно'}
      <span className="sr-only">. {hint}</span>
    </span>
  );
}
