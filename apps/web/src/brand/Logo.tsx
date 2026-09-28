import { useId } from 'react';
import { cn } from '@/lib/cn';
import { BRAND } from './brand';
import {
  MARK_BAR,
  MARK_BODY,
  MARK_EYES,
  MARK_FEET,
  MARK_FOLD_WIDTH,
  MARK_FOLDS,
  MARK_VIEWBOX,
} from './markGeometry';

export type LogoVariant = 'full' | 'mark';
/** color — фирменные цвета темы; mono — один цвет (currentColor) для плашек и приглушённых мест. */
export type LogoTone = 'color' | 'mono';

export type LogoProps = {
  /** full — знак + название, mark — только знак. */
  variant?: LogoVariant;
  tone?: LogoTone;
  /** Высота знака в px. */
  size?: number;
  className?: string;
  /** Декоративный логотип (рядом уже есть текст с названием) — скрыть от скринридеров. */
  decorative?: boolean;
  /**
   * «ИИ думает»: swing — мышь покачивается на перекладине, как от ветра;
   * breathe — ещё и «дышит» (для трудных задач). При prefers-reduced-motion — неподвижна.
   */
  animate?: 'swing' | 'breathe';
};

/**
 * Единственная точка использования логотипа во всём приложении.
 * Цвета — токены --logo-primary / --logo-accent (в тёмной теме меняются сами).
 * tone="mono" рисует знак цветом текста: акцент — тем же цветом с прозрачностью.
 */
export function Logo({
  variant = 'full',
  tone = 'color',
  size = 28,
  className,
  decorative = false,
  animate,
}: LogoProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const titleId = `logo-title-${uid}`;
  const maskId = `logo-cut-${uid}`;
  const a11y = decorative
    ? { 'aria-hidden': true as const }
    : { role: 'img' as const, 'aria-labelledby': titleId };

  const primary = tone === 'mono' ? 'fill-current' : 'fill-logo-primary';
  const accent = tone === 'mono' ? 'fill-current opacity-55' : 'fill-logo-accent';
  const mark = (
    <svg
      width={size}
      height={size}
      viewBox={MARK_VIEWBOX}
      className="shrink-0"
      {...(variant === 'mark' ? a11y : { 'aria-hidden': true })}
    >
      {variant === 'mark' && !decorative && <title id={titleId}>{BRAND.name}</title>}
      <defs>
        {/* Складки крыльев и глаза — вырезы: прозрачные на любом фоне */}
        <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={100} height={100}>
          <rect width={100} height={100} fill="#fff" />
          {MARK_FOLDS.map((d) => (
            <path
              key={d}
              d={d}
              fill="none"
              stroke="#000"
              strokeWidth={MARK_FOLD_WIDTH}
              strokeLinecap="round"
            />
          ))}
          {MARK_EYES.map((e) => (
            <circle key={e.cx} cx={e.cx} cy={e.cy} r={e.r} fill="#000" />
          ))}
        </mask>
      </defs>
      <rect
        x={MARK_BAR.x}
        y={MARK_BAR.y}
        width={MARK_BAR.w}
        height={MARK_BAR.h}
        rx={MARK_BAR.r}
        className={accent}
      />
      {/* перекладина неподвижна, мышь (лапки + тело) качается вокруг точки крепления */}
      <g className={cn(animate && 'bat-swing')}>
        <g className={cn(animate === 'breathe' && 'bat-breathe')}>
          <path d={MARK_BODY} mask={`url(#${maskId})`} className={primary} />
        </g>
        <path d={MARK_FEET} className={primary} />
      </g>
    </svg>
  );

  if (variant === 'mark') {
    return <span className={cn('inline-flex text-heading', className)}>{mark}</span>;
  }

  return (
    <span
      className={cn('inline-flex items-center gap-2.5 text-heading', className)}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': BRAND.name })}
    >
      {mark}
      <span
        className="font-semibold tracking-tight"
        style={{ fontSize: Math.round(size * 0.64), lineHeight: 1 }}
      >
        {BRAND.name}
      </span>
    </span>
  );
}
