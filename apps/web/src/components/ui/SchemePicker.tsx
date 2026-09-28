import { colorSchemes, schemeNames, type SchemeName } from '@app/tokens';
import { Check, Palette } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useTheme } from '@/theme/useTheme';
import { Menu, type MenuItem } from './Menu';

/**
 * Образец схемы: основной акцент и глубокий тон — как кнопка на фоне.
 * Цвета берутся из токенов схемы (packages/tokens), а не задаются здесь.
 */
function Swatch({ scheme, size = 16 }: { scheme: SchemeName; size?: number }) {
  const c = colorSchemes[scheme];
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full border border-line"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${c.main} 0 50%, ${c.deep} 50% 100%)`,
      }}
    />
  );
}

/**
 * Выбор цветовой схемы в «Настройках» (ТЗ v4.11): образцы-кнопки с подписью.
 * Каждая схема — проверенный набор токенов со светлой и тёмной темой (контраст AA).
 */
export function SchemePicker({ className }: { className?: string }) {
  const { scheme, setScheme } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Цвет оформления"
      className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3', className)}
    >
      {schemeNames.map((n) => {
        const active = n === scheme;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setScheme(n)}
            className={cn(
              'flex h-11 items-center gap-2.5 rounded-control border px-3 text-left text-sm transition-colors duration-200',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
              active
                ? 'border-primary-border bg-accent-soft text-heading'
                : 'border-line bg-surface text-fg hover:border-line-strong',
            )}
          >
            <Swatch scheme={n} size={20} />
            <span className="min-w-0 flex-1 truncate">{colorSchemes[n].label}</span>
            {active && <Check size={16} className="shrink-0" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

/** Кнопка рядом с переключателем темы в боковом меню: быстрый выбор цвета. */
export function SchemeMenu() {
  const { scheme, setScheme } = useTheme();
  const items: MenuItem[] = [
    { kind: 'label', id: 'l', label: 'Цвет оформления' },
    ...schemeNames.map((n): MenuItem => ({
      id: n,
      label: colorSchemes[n].label,
      icon: <Swatch scheme={n} />,
      checked: n === scheme,
      onSelect: () => setScheme(n),
    })),
  ];
  return (
    <Menu
      label={`Цвет оформления: ${colorSchemes[scheme].label}`}
      icon={<Palette size={18} />}
      items={items}
    />
  );
}
