import type { Task } from '@app/shared';
import { Flag, Info } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { fieldClass } from '@/components/ui/Field';
import { URGENT_NOTE } from '@/components/ui/UrgentMark';
import { cn } from '@/lib/cn';

const REASONS = ['Работа стоит', 'Нужно сегодня', 'Не работает у нескольких человек'];

/**
 * «Попросить срочно» (ТЗ v4.16): для каждого срочно по-своему, поэтому уровни не показываем —
 * человек сам просит и объясняет почему. Каждый раз предупреждаем: это только просьба специалисту,
 * на скорость ответа и очередь она не влияет.
 */
export function UrgentDialog({
  task,
  onClose,
  onSave,
}: {
  task: Task | undefined;
  onClose: () => void;
  onSave: (reason: string | null) => void;
}) {
  const [reason, setReason] = useState('');
  const id = useId();
  const noteId = useId();
  const current = task?.urgentRequest ?? null;

  useEffect(() => {
    if (task) setReason(task.urgentRequest?.reason ?? '');
  }, [task]);

  const text = reason.trim();
  return (
    <Dialog
      open={!!task}
      onClose={onClose}
      title={current ? 'Просьба «Срочно»' : 'Попросить срочно'}
      footer={
        <>
          {current && (
            <Button variant="ghost" onClick={() => onSave(null)} className="mr-auto">
              Снять метку
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button icon={<Flag size={16} />} disabled={text.length < 3} onClick={() => onSave(text)}>
            {current ? 'Сохранить' : 'Отметить «Срочно»'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p
          id={noteId}
          className="flex items-start gap-2 rounded-card bg-accent-soft px-3 py-2.5 text-sm text-on-accent-soft"
        >
          <Info size={16} aria-hidden className="mt-0.5 shrink-0" />
          <span>{URGENT_NOTE}</span>
        </p>
        <div className="flex flex-col gap-1">
          <label htmlFor={id} className="text-sm font-medium text-heading">
            Почему срочно?
          </label>
          <textarea
            id={id}
            rows={2}
            maxLength={300}
            value={reason}
            aria-describedby={noteId}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Например: в 15:00 отчёт руководителю, без почты не отправить"
            className={cn(fieldClass, 'resize-y py-2 leading-snug')}
          />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Готовые причины">
          {REASONS.map((r) => (
            <Button key={r} size="sm" variant="secondary" onClick={() => setReason(r)}>
              {r}
            </Button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
