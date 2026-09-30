import { Menu } from 'lucide-react';
import { useCallback, useState, type ReactNode } from 'react';
import { Logo } from '@/brand/Logo';
import { IconButton } from '@/components/ui/IconButton';
import { MobileNavSheet } from './MobileNavSheet';
import { AppNav } from './AppNav';
import { NavArrows } from './NavArrows';

type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Обои под контентом (как фон чата в мессенджерах). Включается на доске. */
  wallpaper?: boolean;
  children: ReactNode;
};

/**
 * Каркас экрана: боковое меню (разделы пользователя или очереди специалиста) (≥ 1024 px) или кнопка меню (< 1024 px),
 * шапка с названием экрана и прокручиваемая область контента.
 */
export function AppShell({ title, subtitle, actions, wallpaper = false, children }: Props) {
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = useCallback(() => setNavOpen(false), []);

  // overflow-clip: каркас нельзя прокрутить даже программно (фокус на скрытом поле, v4.29.1) —
  // иначе содержимое уезжает за край и экран остаётся пустым
  return (
    <div className="flex h-dvh overflow-hidden supports-[overflow:clip]:overflow-clip">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2 focus:shadow-raised"
      >
        Перейти к содержимому
      </a>

      <aside className="hidden w-[264px] shrink-0 border-r border-line bg-surface lg:block">
        <AppNav />
      </aside>

      <MobileNavSheet open={navOpen} onClose={closeNav} />

      <div className="relative isolate flex min-w-0 flex-1 flex-col">
        {wallpaper && (
          <div aria-hidden className="wallpaper pointer-events-none absolute inset-0 -z-10" />
        )}
        <header className="flex min-h-16 shrink-0 items-center gap-2 border-b border-line bg-canvas px-2 sm:px-4 lg:px-6">
          <IconButton
            label="Открыть меню"
            icon={<Menu size={22} />}
            onClick={() => setNavOpen(true)}
            className="lg:hidden"
            aria-expanded={navOpen}
            aria-haspopup="dialog"
          />
          <span className="hidden sm:inline-flex lg:hidden">
            <Logo variant="mark" size={24} decorative />
          </span>
          <NavArrows className="lg:-ml-2" />
          <div className="min-w-0 flex-1 py-2 pl-1">
            <h1 className="truncate text-lg leading-tight">{title}</h1>
            {subtitle && <p className="truncate text-sm text-fg-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="scroll-paper min-h-0 flex-1 overflow-auto outline-none"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
