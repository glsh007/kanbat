import { COLUMN_LABELS, type ColumnId, type Task } from '@app/shared';
import { isSendKey } from '@/lib/keys';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { fieldClass } from '@/components/ui/Field';
import { cn } from '@/lib/cn';

type Props = {
  task: Task | undefined;
  from: ColumnId | undefined;
  /** Куда вернётся карточка (по умолчанию — где она сейчас: её уже перетащили). */
  to?: ColumnId;
  onConfirm: (note: string) => void;
  onCancel: () => void;
};

const suggestions = ['Короче', 'Подробнее', 'Проще, без терминов', 'Другой способ'];

/**
 * «Доработать» (ТЗ, п. 3): карточку вернули назад — спрашиваем, что изменить.
 * Отмена возвращает карточку туда, где она была.
 */
export function ReworkDialog({ task, from, to, onConfirm, onCancel }: Props) {
  const [note, setNote] = useState('');
  const fieldId = useId();

  const taskId = task?.id;
  useEffect(() => {
    if (taskId) setNote('');
  }, [taskId]);

  const submit = () => {
    if (note.trim()) onConfirm(note);
  };

  return (
    <Dialog
      open={!!task}
      onClose={onCancel}
      title="Что доработать?"
      description={
        task && from && from !== (to ?? task.column)
          ? `«${task.title}» вернётся из «${COLUMN_LABELS[from]}» в «${COLUMN_LABELS[to ?? task.column]}».`
          : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={!note.trim()}>
            Отправить на доработку
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <label htmlFor={fieldId} className="text-sm font-medium">
          Что изменить
        </label>
        <textarea
          id={fieldId}
          data-autofocus
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (isSendKey(e)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Например: сделай короче и добавь пример"
          className={cn(fieldClass, 'resize-none py-2 text-sm leading-relaxed')}
        />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Быстрые варианты">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setNote((n) => (n.trim() ? `${n.trim()}, ${s.toLowerCase()}` : s))}
              className="h-8 rounded-full border border-line-strong px-3 text-sm text-fg transition-colors duration-200 hover:bg-accent-soft"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
