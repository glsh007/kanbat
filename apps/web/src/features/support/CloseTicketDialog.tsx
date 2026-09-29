import { CLOSE_REASON_LABELS, type CloseReason } from '@app/shared';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { fieldClass } from '@/components/ui/Field';
import { cn } from '@/lib/cn';

const REASONS: CloseReason[] = ['spam', 'duplicate', 'wrong', 'other'];

/**
 * «Закрыть без решения» (ТЗ v4.22) — для мусора: спам, повтор, не по адресу. Пользователь увидит
 * причину в своём чате и сможет возобновить обращение, если это ошибка.
 */
export function CloseTicketDialog({
  open,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (reason: CloseReason, note: string) => void;
}) {
  const [reason, setReason] = useState<CloseReason | null>(null);
  const [note, setNote] = useState('');
  const noteId = useId();
  const legendId = useId();

  // каждое открытие — с чистого листа
  useEffect(() => {
    if (open) {
      setReason(null);
      setNote('');
    }
  }, [open]);

  const ready = !!reason && (reason !== 'other' || note.trim().length > 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Закрыть без решения?"
      description="Для заявок, которые решать не нужно. Пользователь увидит причину в своём чате и сможет возобновить обращение, если это ошибка."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button
            disabled={!ready || busy}
            onClick={() => reason && onConfirm(reason, note.trim())}
          >
            Закрыть заявку
          </Button>
        </>
      }
    >
      <fieldset className="flex flex-col gap-1" aria-labelledby={legendId}>
        <legend id={legendId} className="mb-1 text-sm font-medium text-heading">
          Причина
        </legend>
        {REASONS.map((r) => (
          <label
            key={r}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-2 hover:bg-sunken"
          >
            <input
              type="radio"
              name="close-reason"
              value={r}
              checked={reason === r}
              onChange={() => setReason(r)}
              className="size-4 accent-primary"
            />
            <span>
              {CLOSE_REASON_LABELS[r].charAt(0).toUpperCase() + CLOSE_REASON_LABELS[r].slice(1)}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="mt-3 flex flex-col gap-1">
        <label htmlFor={noteId} className="text-sm font-medium text-heading">
          Пояснение для пользователя{reason === 'other' ? '' : ' (необязательно)'}
        </label>
        <textarea
          id={noteId}
          rows={2}
          maxLength={300}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            reason === 'duplicate'
              ? 'Например: отвечаем в заявке «Не работает VPN»'
              : 'Коротко, почему закрываем'
          }
          className={cn(fieldClass, 'resize-none py-2 text-sm')}
        />
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-heading">
          {error}
        </p>
      )}
    </Dialog>
  );
}
