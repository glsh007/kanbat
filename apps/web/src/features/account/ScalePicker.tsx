import { useId } from 'react';
import { cn } from '@/lib/cn';
import { UI_SCALES, useUiScale } from '@/lib/uiScale';

/** «Настройки» → «Оформление» → «Размер интерфейса» (ТЗ v4.18). */
export function ScalePicker() {
  const scale = useUiScale((s) => s.scale);
  const set = useUiScale((s) => s.set);
  const labelId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <p id={labelId} className="text-sm font-medium text-heading">
        Размер интерфейса
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="grid grid-cols-4 gap-0.5 rounded-control border border-line bg-sunken p-0.5"
      >
        {UI_SCALES.map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={scale === v}
            onClick={() => set(v)}
            className={cn(
              'inline-flex h-8 items-center justify-center rounded-[8px] px-2 text-sm tabular-nums transition-colors duration-200',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
              scale === v
                ? 'bg-surface font-medium text-heading shadow-card'
                : 'text-fg-muted hover:text-fg',
            )}
          >
            {v} %
          </button>
        ))}
      </div>
      <p className="text-xs text-fg-muted">
        Текст и кнопки крупнее или мельче — только на этом устройстве. Как Ctrl + колесо мыши, но
        запоминается.
      </p>
    </div>
  );
}
