import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { IconButton } from '@/components/ui/IconButton';
import { AppNav } from './AppNav';

type Props = { open: boolean; onClose: () => void };

/** Выдвижное меню для mobile/tablet (< 1024 px). */
export function MobileNavSheet({ open, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prevFocus?.focus();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <motion.div
            className="absolute inset-0 bg-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Меню"
            tabIndex={-1}
            className="absolute inset-y-0 left-0 w-[min(320px,86vw)] rounded-r-panel border-r border-line bg-surface shadow-raised outline-none"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <IconButton
              label="Закрыть меню"
              icon={<X size={20} />}
              onClick={onClose}
              className="absolute top-3 right-3"
            />
            <AppNav onNavigate={onClose} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
