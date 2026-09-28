import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './IconButton';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Модальное окно: на desktop — по центру, на mobile — нижний лист.
 * Esc закрывает, фокус заперт внутри и возвращается на прежний элемент.
 */
export function Dialog({ open, onClose, title, description, children, footer }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Колбэк в ref: иначе новый onClose на каждом рендере перезапускал бы эффект (и сбивал фокус)
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const autofocus = panel?.querySelector<HTMLElement>('[data-autofocus]');
    (autofocus ?? panel)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prevFocus?.focus?.();
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            data-no-dnd
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
            className="relative flex w-full max-w-md flex-col gap-4 rounded-t-panel border border-line bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-fg shadow-raised outline-none sm:rounded-panel"
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-lg">
                  {title}
                </h2>
                {description && (
                  <p id={descId} className="mt-1 text-sm text-fg-muted">
                    {description}
                  </p>
                )}
              </div>
              <IconButton
                label="Закрыть"
                icon={<X size={20} />}
                size="sm"
                onClick={onClose}
                className="-mt-1 -mr-1"
              />
            </div>
            {children}
            {footer && <div className="flex flex-wrap justify-end gap-2">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
