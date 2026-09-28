import type { SectionColor } from '@app/shared';
import { cn } from '@/lib/cn';

const colorClass: Record<SectionColor, string> = {
  clay: 'bg-label-clay',
  kraft: 'bg-label-kraft',
  stone: 'bg-label-stone',
  slate: 'bg-label-slate',
};

/** Цветная метка раздела. Декоративная: название раздела всегда рядом текстом. */
export function SectionDot({ color, className }: { color: SectionColor; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-2.5 shrink-0 rounded-full ring-1 ring-line-strong/40',
        colorClass[color],
        className,
      )}
    />
  );
}
