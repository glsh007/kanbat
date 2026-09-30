import { Plus } from 'lucide-react';
import { isSendKey } from '@/lib/keys';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { fieldClass } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import { EXAMPLES } from './examples';

/**
 * Быстрое создание задачи: Enter — сразу отправить ИИ, «В черновик» — просто сохранить,
 * Shift+Enter — перенос строки, Esc — отмена.
 */
export function NewTaskComposer({ onCreate }: { onCreate: (text: string, send: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const id = useId();

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex h-11 min-w-0 items-center gap-2 rounded-control border border-dashed border-line-strong px-3 whitespace-nowrap',
          'text-[15px] font-medium text-heading transition-colors duration-200 hover:bg-surface',
        )}
      >
        <Plus size={18} aria-hidden className="shrink-0" />
        <span className="truncate">Новое обращение</span>
      </button>
    );

  const submit = (send = true) => {
    if (!text.trim()) return;
    onCreate(text, send);
    setText('');
  };

  return (
    <form
      className="flex flex-col gap-2 rounded-card border border-line bg-surface p-2 shadow-card"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor={id} className="sr-only">
        Текст новой задачи
      </label>
      <details className="group text-sm">
        <summary className="cursor-pointer px-1 text-fg-muted select-none">
          Примеры обращений
        </summary>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              title={ex.text}
              onClick={() => setText(ex.text)}
              className="min-h-8 rounded-full border border-line-strong px-2.5 text-xs text-fg transition-colors duration-200 hover:bg-accent-soft"
            >
              {ex.label}
            </button>
          ))}
        </div>
      </details>
      <textarea
        id={id}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- поле открывается по явному нажатию
        autoFocus
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (isSendKey(e)) {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        placeholder="Опишите проблему своими словами"
        className={cn(fieldClass, 'resize-none py-2 text-sm leading-relaxed')}
      />
      <Button size="sm" type="submit" disabled={!text.trim()} className="w-full">
        Отправить ИИ
      </Button>
      <div className="flex items-center justify-between gap-2 px-1 text-sm">
        <button
          type="button"
          disabled={!text.trim()}
          onClick={() => submit(false)}
          className="rounded-[6px] font-medium text-heading underline-offset-4 hover:underline disabled:opacity-50 disabled:hover:no-underline"
        >
          В черновик
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-[6px] text-fg-muted underline-offset-4 hover:underline"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}
