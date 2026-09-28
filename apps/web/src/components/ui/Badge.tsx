import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'accent' | 'neutral' | 'outline';

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone };

const tones: Record<BadgeTone, string> = {
  accent: 'bg-accent-soft text-on-accent-soft',
  neutral: 'bg-sunken text-fg',
  outline: 'border border-line-strong text-fg',
};

export function Badge({ tone = 'accent', className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium tabular-nums',
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}
