import { AnimatePresence, motion } from 'motion/react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { IconButton } from './IconButton';

export type MenuItem =
  | {
      kind?: 'item';
      id: string;
      label: string;
      icon?: ReactNode;
      disabled?: boolean;
      /** Для выбора из набора (например, столбца): рисует галочку и aria-checked. */
      checked?: boolean;
      /** Независимая отметка (можно несколько, например разделы) — menuitemcheckbox, а не radio. */
      multi?: boolean;
      onSelect: () => void;
    }
  | { kind: 'label'; id: string; label: string }
  | { kind: 'separator'; id: string };

type Props = {
  /** Подпись кнопки-триггера для скринридеров. */
  label: string;
  icon: ReactNode;
  items: MenuItem[];
  triggerClassName?: string;
};

const WIDTH = 232;
const GAP = 6;

/**
 * Выпадающее меню с клавиатурой (стрелки, Home/End, Esc) по паттерну WAI-ARIA menu button.
 * Рендерится в портал с position: fixed — иначе его обрезали бы столбцы доски
 * (у них backdrop-filter, который создаёт свой контейнер для fixed-элементов).
 */
export function Menu({ label, icon, items, triggerClassName }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean }>({
    top: 0,
    left: 0,
    up: false,
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const height = menuRef.current?.offsetHeight ?? 240;
    const up = r.bottom + GAP + height > window.innerHeight - 8 && r.top - GAP - height > 8;
    const left = Math.min(Math.max(8, r.right - WIDTH), window.innerWidth - WIDTH - 8);
    setPos({ top: up ? r.top - GAP - height : r.bottom + GAP, left, up });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLElement>(
      '[role^="menuitem"]:not([aria-disabled="true"])',
    );
    first?.focus();

    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) close(false);
    };
    const onScrollOrResize = () => close(false);
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open, close]);

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const nodes = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>(
        '[role^="menuitem"]:not([aria-disabled="true"])',
      ) ?? [],
    );
    const i = nodes.indexOf(document.activeElement as HTMLElement);
    const focusAt = (n: number) => nodes[(n + nodes.length) % nodes.length]?.focus();
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusAt(i + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusAt(i - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusAt(0);
        break;
      case 'End':
        e.preventDefault();
        focusAt(nodes.length - 1);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      case 'Tab':
        close(false);
        break;
    }
  };

  return (
    <>
      <IconButton
        ref={triggerRef}
        label={label}
        icon={icon}
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-no-dnd
        onClick={() => setOpen((v) => !v)}
        className={triggerClassName}
      />
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label={label}
              data-no-dnd
              onKeyDown={onMenuKeyDown}
              initial={{ opacity: 0, y: pos.up ? 4 : -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: pos.up ? 4 : -4, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.2, 0.7, 0.2, 1] }}
              style={{ top: pos.top, left: pos.left, width: WIDTH }}
              className="fixed z-50 flex flex-col rounded-card border border-line bg-surface p-1.5 text-fg shadow-raised"
            >
              {items.map((item) => {
                if (item.kind === 'separator')
                  return <div key={item.id} role="separator" className="my-1 h-px bg-line" />;
                if (item.kind === 'label')
                  return (
                    <div
                      key={item.id}
                      role="presentation"
                      className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-fg-muted"
                    >
                      {item.label}
                    </div>
                  );
                const isChecked = item.checked !== undefined;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role={
                      !isChecked ? 'menuitem' : item.multi ? 'menuitemcheckbox' : 'menuitemradio'
                    }
                    aria-checked={isChecked ? item.checked : undefined}
                    aria-disabled={item.disabled || undefined}
                    tabIndex={-1}
                    onClick={() => {
                      if (item.disabled) return;
                      close();
                      item.onSelect();
                    }}
                    className={cn(
                      'flex h-10 items-center gap-2.5 rounded-[10px] px-2.5 text-left text-sm',
                      'transition-colors duration-150 hover:bg-accent-soft focus:bg-accent-soft',
                      'focus-visible:outline-offset-[-2px]',
                      item.disabled && 'cursor-default opacity-60 hover:bg-transparent',
                    )}
                  >
                    <span className="inline-flex w-4 shrink-0 justify-center" aria-hidden>
                      {isChecked && !item.icon ? item.checked && <Check size={16} /> : item.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {/* выбор с образцом (цветовые схемы): образец слева, галочка справа */}
                    {isChecked && item.icon && item.checked && (
                      <Check size={16} className="shrink-0" aria-hidden />
                    )}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
