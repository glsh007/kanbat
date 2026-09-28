import { REPORT_REASONS, type ReportReason } from '@app/shared';
import { Flag, FolderInput } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { fieldClass } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import { handle, useForumSections } from './sections';

/** Перенести тему в другое сообщество. */
export function MoveDialog({
  open,
  current,
  onClose,
  onMove,
}: {
  open: boolean;
  current: string;
  onClose: () => void;
  onMove: (sectionId: string, label: string) => Promise<void>;
}) {
  const sections = useForumSections((s) => s.sections);
  const [to, setTo] = useState('');
  const id = useId();
  const options = sections.filter((s) => s.id !== current);
  const target = options.find((s) => s.id === to) ?? options[0];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Перенести тему"
      description="Тема переедет вместе с ответами. В теме появится запись, кто и куда её перенёс."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button
            icon={<FolderInput size={16} />}
            disabled={!target}
            onClick={() => target && void onMove(target.id, handle(target))}
          >
            Перенести
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-sm font-medium text-heading">
          Куда
        </label>
        <select
          id={id}
          data-autofocus
          value={target?.id ?? ''}
          onChange={(e) => setTo(e.target.value)}
          className={cn(fieldClass, 'h-11')}
        >
          {options.map((s) => (
            <option key={s.id} value={s.id}>
              {handle(s)} — {s.name}
            </option>
          ))}
        </select>
      </div>
    </Dialog>
  );
}

/** Изменить заголовок темы. */
export function RenameDialog({
  open,
  title,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onSave: (title: string) => Promise<void>;
}) {
  const [value, setValue] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  const id = useId();
  // при каждом открытии — текущий заголовок
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValue(title);
      setError(null);
      setBusy(false);
    }
  }
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(value.trim());
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Изменить заголовок"
      description="Заголовок — как вопрос, который ищут: его увидят в ленте и в поиске."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button onClick={() => void save()} disabled={busy || !value.trim()}>
            Сохранить
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label htmlFor={id} className="text-sm font-medium text-heading">
          Заголовок
        </label>
        <input
          id={id}
          data-autofocus
          value={value}
          maxLength={150}
          onChange={(e) => setValue(e.target.value)}
          className={cn(fieldClass, 'h-11')}
        />
        {error && (
          <p role="alert" className="text-sm font-medium text-heading">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}

/** Жалоба на тему: причина и, по желанию, пояснение. */
export function ReportDialog({
  open,
  onClose,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  onSend: (reason: ReportReason, note?: string) => Promise<void>;
}) {
  const [reason, setReason] = useState<ReportReason>('spam');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  const name = useId();
  const noteId = useId();
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setReason('spam');
      setNote('');
      setError(null);
      setBusy(false);
    }
  }
  const send = async () => {
    if (reason === 'other' && !note.trim()) return setError('Напишите, что не так');
    setBusy(true);
    setError(null);
    try {
      await onSend(reason, note.trim() || undefined);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Пожаловаться на тему"
      description="Жалобу увидят только специалисты поддержки. После трёх жалоб тема скрывается до проверки."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button icon={<Flag size={16} />} onClick={() => void send()} disabled={busy}>
            Отправить
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <fieldset className="flex flex-col gap-1">
          <legend className="pb-1.5 text-sm font-medium text-heading">Что не так</legend>
          {(Object.keys(REPORT_REASONS) as ReportReason[]).map((r, i) => (
            <label
              key={r}
              className="flex cursor-pointer items-center gap-3 rounded-control px-2 py-2 text-[15px] hover:bg-sunken"
            >
              <input
                type="radio"
                name={name}
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
                {...(i === 0 ? { 'data-autofocus': true } : {})}
                className="size-4 accent-[var(--primary)]"
              />
              {REPORT_REASONS[r]}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={noteId} className="text-sm font-medium text-heading">
            Пояснение{' '}
            <span className="font-normal text-fg-muted">
              {reason === 'other' ? '(обязательно)' : '(необязательно)'}
            </span>
          </label>
          <textarea
            id={noteId}
            rows={2}
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              reason === 'offtopic'
                ? 'Например: это про VPN, лучше в б/сеть'
                : 'Коротко, что не так'
            }
            className={cn(fieldClass, 'resize-none py-2 text-sm leading-relaxed')}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm font-medium text-heading">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
