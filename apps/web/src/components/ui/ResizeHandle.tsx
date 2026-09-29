import { useRef } from 'react';
import { cn } from '@/lib/cn';
import type { PanelWidth } from '@/lib/panelWidth';

/**
 * Край панели, за который её можно расширить или сузить (ТЗ v4.18) — только на широком экране.
 * Мышью или пальцем — перетащить; с клавиатуры — стрелки (Shift — шагом крупнее), Home / End;
 * двойной щелчок или Enter — ширина по умолчанию.
 * `edge="left"` — край слева у панели, прижатой вправо (чат поверх доски): тянем влево — шире;
 * `edge="right"` — правый край списка слева: тянем вправо — шире. Для списка ручку кладут в
 * `<ListEdge>` — обёртку нулевой ширины между списком и содержимым (список прокручивается сам).
 */
export function ResizeHandle({
  panel,
  edge,
  label,
}: {
  panel: PanelWidth;
  edge: 'left' | 'right';
  label: string;
}) {
  const start = useRef<{ x: number; w: number } | null>(null);
  const sign = edge === 'left' ? -1 : 1;
  return (
    // фокусируемый separator — виджет по стандарту ARIA (window splitter), линтер его не знает
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={panel.width}
      aria-valuemin={panel.min}
      aria-valuemax={panel.max}
      aria-valuetext={`${panel.width} пикселей`}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- см. выше: window splitter
      tabIndex={0}
      title="Потяните, чтобы изменить ширину. Двойной щелчок — как было."
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, w: panel.width };
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (s) panel.setWidth(s.w + sign * (e.clientX - s.x));
      }}
      onPointerUp={() => (start.current = null)}
      onPointerCancel={() => (start.current = null)}
      onDoubleClick={() => panel.setWidth(panel.def)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 64 : 16;
        if (e.key === 'ArrowLeft') panel.setWidth(panel.width - sign * step);
        else if (e.key === 'ArrowRight') panel.setWidth(panel.width + sign * step);
        else if (e.key === 'Home') panel.setWidth(panel.min);
        else if (e.key === 'End') panel.setWidth(panel.max);
        else if (e.key === 'Enter') panel.setWidth(panel.def);
        else return;
        e.preventDefault();
      }}
      className={cn(
        // по центру своей линии: у чата поверх доски — его левый край, у списка — обёртка нулевой ширины
        'group absolute inset-y-0 -left-1.5 z-30 hidden w-3 cursor-col-resize touch-none lg:block',
        'focus-visible:outline-none',
      )}
    >
      {/* тонкая линия, заметная при наведении и фокусе */}
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full transition-colors duration-200',
          'group-hover:bg-line-strong group-focus-visible:bg-focus group-active:bg-primary',
        )}
      />
    </div>
  );
}

/** Обёртка ручки между двумя колонками: нулевой ширины, видна только на широком экране. */
export function ListEdge(props: { panel: PanelWidth; label: string }) {
  return (
    <div className="relative hidden w-0 shrink-0 lg:block">
      <ResizeHandle edge="right" {...props} />
    </div>
  );
}
