import { isManualSection, type Task } from '@app/shared';
import { Check, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { fieldClass } from '@/components/ui/Field';
import { useBoard } from '@/features/board/store';
import { statusText } from '@/features/requests/status';
import { cn } from '@/lib/cn';
import { useAddToSection } from './addStore';

const byRecent = (a: Task, b: Task) => b.updatedAt.localeCompare(a.updatedAt);

/**
 * «Добавить обращения» (ТЗ v4.6, п. 5): человек сам отмечает, какие обращения показывать
 * в разделе, — по любой причине, не глядя на тематику. Снятая галочка — «убрать из раздела»:
 * обращение остаётся в «Общем».
 */
export function AddToSectionDialog() {
  const sectionId = useAddToSection((s) => s.sectionId);
  const close = useAddToSection((s) => s.close);
  const section = useBoard((s) => s.sections.find((x) => x.id === sectionId));
  const tasks = useBoard((s) => s.tasks);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const searchId = useId();

  // при открытии — отмечено то, что уже в разделе
  useEffect(() => {
    if (!sectionId) return;
    setPicked(
      new Set(
        Object.values(useBoard.getState().tasks)
          .filter((t) => t.sections.includes(sectionId))
          .map((t) => t.id),
      ),
    );
    setQuery('');
  }, [sectionId]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(tasks)
      .filter((t) => !q || t.title.toLowerCase().includes(q))
      .sort(byRecent);
  }, [tasks, query]);

  if (!section) return null;

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const apply = () => {
    const store = useBoard.getState();
    for (const t of Object.values(store.tasks)) {
      const on = picked.has(t.id);
      if (on !== t.sections.includes(section.id)) store.setTaskSection(t.id, section.id, on);
    }
    close();
  };

  return (
    <Dialog
      open={!!sectionId}
      onClose={close}
      title={`Обращения в разделе «${section.name}»`}
      description={
        isManualSection(section)
          ? 'Отметьте обращения, которые хотите держать вместе. ИИ сюда ничего не добавляет.'
          : 'Отметьте обращения вручную. ИИ по-прежнему добавляет подходящие по смыслу.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Отмена
          </Button>
          <Button icon={<Check size={16} />} onClick={apply}>
            Готово · {picked.size}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            Найти обращение
          </label>
          <Search
            size={16}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted"
          />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти обращение"
            className={cn(fieldClass, 'h-10 pl-9 text-sm')}
          />
        </div>
        {Object.keys(tasks).length === 0 ? (
          <p className="text-sm text-fg-muted">
            Обращений пока нет — сначала напишите, что случилось.
          </p>
        ) : list.length === 0 ? (
          <p className="text-sm text-fg-muted">Ничего не нашлось.</p>
        ) : (
          <ul
            aria-label="Обращения"
            className="scroll-paper -mx-1 flex max-h-[min(50vh,420px)] flex-col gap-0.5 overflow-y-auto px-1"
          >
            {list.map((t) => {
              const on = picked.has(t.id);
              return (
                <li key={t.id}>
                  <label
                    className={cn(
                      'grid cursor-pointer grid-cols-[auto_1fr] items-start gap-x-3 rounded-control px-2.5 py-2 transition-colors duration-200',
                      'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-focus',
                      on ? 'bg-accent-soft text-on-accent-soft' : 'hover:bg-sunken',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(t.id)}
                      className="row-span-2 mt-0.5 size-4 accent-[var(--primary)]"
                    />
                    <span className="min-w-0 text-sm leading-snug font-medium">{t.title}</span>
                    <span className={cn('text-xs', on ? '' : 'text-fg-muted')}>
                      {statusText(t)}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
