import {
  COLUMN_LABELS,
  COLUMNS,
  columnIndex,
  type TaskDifficulty,
  type TaskStructure,
} from '@app/shared';
import {
  checkContrast,
  palette,
  paletteLabels,
  semanticTokenNames,
  themes,
  toRgbaString,
  type PaletteKey,
} from '@app/tokens';
import { Check, Plus, Settings, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from '@/brand/Logo';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { TaskTypeBadge } from '@/components/ui/TaskTypeBadge';
import { AppShell } from '@/layout/AppShell';
import { cn } from '@/lib/cn';
import { useTheme } from '@/theme/useTheme';

function Block({ title, children, hint }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg">{title}</h2>
        {hint && <p className="text-sm text-fg-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

const stripClass = ['bg-col-1', 'bg-col-2', 'bg-col-3', 'bg-col-4', 'bg-col-5'] as const;

const kinds: { structure: TaskStructure; difficulty: TaskDifficulty; title: string }[] = [
  { structure: 'clear', difficulty: 'easy', title: 'Переведи абзац на английский' },
  { structure: 'clear', difficulty: 'hard', title: 'Напиши ТЗ на лендинг по брифу' },
  { structure: 'loose', difficulty: 'easy', title: 'Придумай подарок коллеге' },
  { structure: 'loose', difficulty: 'hard', title: 'Хочу запустить свой проект' },
];

export default function DesignPage() {
  const { resolved } = useTheme();
  const theme = themes[resolved];
  const contrast = checkContrast();
  const failed = contrast.filter((r) => !r.pass).length;

  return (
    <AppShell title="Дизайн-система" subtitle="Токены, компоненты и проверка контраста">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 p-4 pb-16 sm:p-6">
        <Block title="Палитра" hint="Базовые цвета. В интерфейсе — только через смысловые токены.">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(Object.keys(palette) as PaletteKey[]).map((k) => (
              <li key={k}>
                <Card className="overflow-hidden">
                  <div
                    className="h-16 border-b border-line"
                    style={{ background: `var(--${k})` }}
                  />
                  <div className="p-3">
                    <div className="text-sm font-medium">{paletteLabels[k]}</div>
                    <code className="text-xs text-fg-muted">
                      --{k} {palette[k]}
                    </code>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </Block>

        <Block
          title="Смысловые токены"
          hint={`Текущая тема: ${resolved === 'dark' ? 'тёмная' : 'светлая'}. Переключите тему в меню — значения обновятся.`}
        >
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {semanticTokenNames.map((n) => {
              const v = theme[n];
              return (
                <li
                  key={n}
                  className="flex items-center gap-3 rounded-control border border-line bg-surface p-2"
                >
                  <span
                    className="size-8 shrink-0 rounded-[8px] border border-line"
                    style={{ background: `var(--${n})` }}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <code className="block truncate text-sm">--{n}</code>
                    <span className="block truncate text-xs text-fg-muted">
                      {v.alpha === undefined ? v.hex : toRgbaString(v.hex, v.alpha)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Block>

        <Block title="Типографика" hint="Onest — гротеск с хорошей кириллицей.">
          <Card className="flex flex-col gap-3 p-5">
            <p className="text-2xl font-semibold text-heading">Заголовок экрана — 24/600</p>
            <p className="text-lg font-semibold text-heading">Заголовок блока — 18/600</p>
            <p>Основной текст — 15/400. Каждый запрос — задача на доске.</p>
            <p className="text-sm text-fg-muted">Вторичный текст — 14/400, приглушённый.</p>
            <code className="w-fit rounded-[8px] bg-sunken px-2 py-1 font-mono text-sm">
              const column = &apos;done&apos;;
            </code>
          </Card>
        </Block>

        <Block title="Кнопки">
          <Card className="flex flex-wrap items-center gap-3 p-5">
            <Button icon={<Plus size={18} />}>Новая задача</Button>
            <Button variant="secondary">Отправить позже</Button>
            <Button variant="ghost">Отмена</Button>
            <Button size="sm" icon={<Check size={16} />}>
              Принять
            </Button>
            <Button disabled>Недоступно</Button>
            <IconButton label="Настройки" icon={<Settings size={20} />} />
            <IconButton label="Закрыть" icon={<X size={20} />} size="sm" />
          </Card>
        </Block>

        <Block title="Типы задач" hint="■ чёткая / ◌ размытая структура + 1–3 деления сложности.">
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {kinds.map((k) => (
              <li key={`${k.structure}-${k.difficulty}`}>
                <Card className="flex flex-col gap-3 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <TaskTypeBadge structure={k.structure} difficulty={k.difficulty} showKind />
                    <Badge tone="neutral">
                      {k.structure === 'clear' && k.difficulty === 'easy'
                        ? 'Без остановок'
                        : 'С контрольными точками'}
                    </Badge>
                  </div>
                  <p className="font-medium text-heading">{k.title}</p>
                </Card>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Badge>Акцент</Badge>
            <Badge tone="neutral">Нейтральный</Badge>
            <Badge tone="outline">Контурный</Badge>
          </div>
        </Block>

        <Block
          title="Градиент готовности"
          hint="Полоса сверху столбца «теплеет» от Черновика к Готово."
        >
          <div className="grid grid-cols-5 gap-2">
            {COLUMNS.map((c) => (
              <div key={c} className="flex flex-col gap-2">
                <div className={cn('h-2 rounded-full', stripClass[columnIndex(c) - 1])} />
                <span className="truncate text-xs text-fg-muted">{COLUMN_LABELS[c]}</span>
              </div>
            ))}
          </div>
        </Block>

        <Block
          title="Обои доски"
          hint="Градиент из 4 точек (--wallpaper-1…4) и контурный узор (--wallpaper-ink). Столбцы полупрозрачные (--column)."
        >
          <div className="relative isolate h-48 overflow-hidden rounded-panel border border-line">
            <div aria-hidden className="wallpaper absolute inset-0 -z-10" />
            <div className="absolute inset-y-4 left-4 w-40 rounded-panel border border-line bg-column p-3 backdrop-blur-sm sm:w-56">
              <p className="text-[15px] font-semibold text-heading">В работе</p>
              <p className="text-sm text-fg-muted">ИИ готовит ответ</p>
            </div>
          </div>
        </Block>

        <Block
          title="Логотип"
          hint='Знак по эскизу в палитре продукта. Цвета — токены --logo-primary/--logo-accent (в тёмной теме тёмные части становятся ivory). На цветных плашках — tone="mono".'
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card className="grid h-28 place-items-center">
              <Logo variant="full" size={32} />
            </Card>
            <Card className="grid h-28 place-items-center">
              <div className="flex items-end gap-4">
                <Logo variant="mark" size={16} />
                <Logo variant="mark" size={32} />
                <Logo variant="mark" size={48} />
              </div>
            </Card>
            <div className="grid h-28 place-items-center rounded-card bg-inverse text-on-inverse">
              <Logo variant="full" tone="mono" size={32} className="text-on-inverse" />
            </div>
          </div>
        </Block>

        <Block
          title="Контраст (WCAG AA)"
          hint={
            failed === 0
              ? `Все ${contrast.length} пар проходят: текст ≥ 4.5:1, элементы интерфейса ≥ 3:1.`
              : `Не проходят: ${failed} из ${contrast.length}.`
          }
        >
          <div className="scroll-paper relative overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-sunken text-fg-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Тема</th>
                  <th className="px-3 py-2 font-medium">Пара</th>
                  <th className="px-3 py-2 font-medium">Где</th>
                  <th className="px-3 py-2 text-right font-medium">Контраст</th>
                </tr>
              </thead>
              <tbody>
                {contrast.map((r) => (
                  <tr
                    key={`${r.theme}-${r.fg}-${r.bg}-${r.over ?? ''}`}
                    className="border-t border-line"
                  >
                    <td className="px-3 py-2">{r.theme === 'dark' ? 'Тёмная' : 'Светлая'}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-2">
                        <span
                          aria-hidden
                          className="inline-grid size-7 place-items-center rounded-[6px] border border-line text-xs font-semibold"
                          style={{ background: r.bgHex, color: r.fgHex }}
                        >
                          Аа
                        </span>
                        <code className="text-xs">
                          {r.fg} / {r.bg}
                        </code>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-fg-muted">{r.note}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <span
                        className={cn('font-medium', r.pass ? 'text-fg' : 'text-heading underline')}
                      >
                        {r.ratio.toFixed(2)}
                      </span>
                      <span className="text-fg-muted"> / {r.min}</span>
                      <span className="sr-only">{r.pass ? ' — проходит' : ' — не проходит'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Block>
      </div>
    </AppShell>
  );
}
