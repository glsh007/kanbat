import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
};

const base =
  'inline-flex items-center justify-center gap-2 rounded-control border font-medium whitespace-nowrap ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-paper ' +
  'active:translate-y-px disabled:pointer-events-none disabled:opacity-50 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary border-primary-border hover:bg-primary-hover shadow-card',
  secondary: 'bg-surface text-fg border-line-strong hover:bg-sunken',
  ghost: 'bg-transparent text-fg border-transparent hover:bg-accent-soft',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-[15px]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    >
      {icon && (
        <span className="inline-flex shrink-0" aria-hidden>
          {icon}
        </span>
      )}
      {children}
    </button>
  );
});
