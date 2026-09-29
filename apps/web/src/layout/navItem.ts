import { cn } from '@/lib/cn';

/** Пункт бокового меню (разделы пользователя, очереди специалиста, Бат-Форум). */
export const navItemClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex h-11 items-center gap-3 rounded-control px-3 text-[15px] transition-colors duration-200',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
    isActive ? 'bg-accent-soft font-medium text-on-accent-soft' : 'text-fg hover:bg-sunken',
  );
