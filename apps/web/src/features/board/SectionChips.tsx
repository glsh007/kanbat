import type { Section, Task } from '@app/shared';
import { SectionDot } from '@/components/ui/SectionDot';
import { cn } from '@/lib/cn';
import { userSections } from './store';

/** Метки разделов задачи (кроме открытого сейчас). Декоративные точки + названия текстом. */
export function SectionChips({
  task,
  sections,
  view,
  className,
}: {
  task: Task;
  sections: Section[];
  view: string;
  className?: string;
}) {
  const list = userSections(sections).filter((s) => s.id !== view && task.sections.includes(s.id));
  if (!list.length) return null;
  return (
    <ul className={cn('flex flex-wrap gap-1', className)} aria-label="Разделы">
      {list.map((s) => (
        <li
          key={s.id}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-xs text-fg-muted"
        >
          <SectionDot color={s.color} className="size-2" />
          <span className="truncate">{s.name}</span>
        </li>
      ))}
    </ul>
  );
}
