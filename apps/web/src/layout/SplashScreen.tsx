import { motion, useReducedMotion } from 'motion/react';
import { Logo } from '@/brand/Logo';

/** Экран загрузки: знак логотипа с мягкой «дышащей» анимацией. */
export function SplashScreen({ label = 'Загрузка…' }: { label?: string }) {
  const reduce = useReducedMotion();

  return (
    <div role="status" aria-live="polite" className="grid min-h-[60dvh] place-items-center">
      <div className="flex flex-col items-center gap-4">
        <motion.div
          animate={reduce ? undefined : { opacity: [0.55, 1, 0.55], scale: [0.98, 1, 0.98] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Logo variant="mark" size={56} decorative />
        </motion.div>
        <span className="text-sm text-fg-muted">{label}</span>
      </div>
    </div>
  );
}
