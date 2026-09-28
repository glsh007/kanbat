import { Monitor, Moon, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { ThemePreference } from '@/theme/theme';
import { useTheme } from '@/theme/useTheme';

const options: { value: ThemePreference; label: string; icon: ReactNode }[] = [
  { value: 'system', label: 'Как в системе', icon: <Monitor size={16} /> },
  { value: 'light', label: 'Светлая тема', icon: <Sun size={16} /> },
  { value: 'dark', label: 'Тёмная тема', icon: <Moon size={16} /> },
];

/** Переключатель темы: система / светлая / тёмная. */
export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="group"
      aria-label="Тема оформления"
      className={cn('inline-flex rounded-control border border-line bg-sunken p-0.5', className)}
    >
      {options.map((o) => {
        const active = preference === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            aria-label={o.label}
            title={o.label}
            onClick={() => setPreference(o.value)}
            className={cn(
              'inline-flex size-9 items-center justify-center rounded-[10px] transition-colors duration-200',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
              active ? 'bg-surface text-heading shadow-card' : 'text-fg-muted hover:text-fg',
            )}
          >
            <span aria-hidden className="inline-flex">
              {o.icon}
            </span>
          </button>
        );
      })}
    </div>
  );
}
