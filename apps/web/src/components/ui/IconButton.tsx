import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  /** Обязательная подпись для скринридеров — у кнопки нет видимого текста. */
  label: string;
  icon: ReactNode;
  size?: 'sm' | 'md';
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-control text-fg',
        'transition-colors duration-200 ease-paper hover:bg-accent-soft',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        'disabled:pointer-events-none disabled:opacity-50',
        size === 'md' ? 'size-11' : 'size-9',
        className,
      )}
      {...rest}
    >
      <span aria-hidden className="inline-flex">
        {icon}
      </span>
    </button>
  );
});
