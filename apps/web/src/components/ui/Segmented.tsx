import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export type SegmentedOption<T extends string> = {
  id: T;
  label: string;
  icon: LucideIcon;
  title?: string;
};

/**
 * Переключатель из 2–3 вариантов (radiogroup): «Список / Доска», «Доска / Чат».
 * На телефоне — только иконки (подписи остаются для скринридеров).
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly SegmentedOption<T>[];
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid auto-cols-fr grid-flow-col gap-0.5 rounded-control border border-line bg-sunken p-0.5"
    >
      {options.map(({ id, label: text, icon: Icon, title }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          title={title}
          onClick={() => onChange(id)}
          className={cn(
            'inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] px-2.5 text-sm transition-colors duration-200',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
            value === id
              ? 'bg-surface font-medium text-heading shadow-card'
              : 'text-fg-muted hover:text-fg',
          )}
        >
          <Icon size={16} aria-hidden />
          <span className="hidden sm:inline">{text}</span>
          <span className="sr-only sm:hidden">{text}</span>
        </button>
      ))}
    </div>
  );
}
