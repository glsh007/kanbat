import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type CardProps = HTMLAttributes<HTMLDivElement> & { raised?: boolean };

/** «Бумажная» карточка: светлая поверхность, тонкая граница, мягкая тень. */
export function Card({ raised = false, className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card border border-line bg-surface text-fg',
        raised ? 'shadow-raised' : 'shadow-card',
        className,
      )}
      {...rest}
    />
  );
}
