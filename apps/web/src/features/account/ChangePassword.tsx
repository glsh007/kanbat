import { KeyRound } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { fieldClass } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import { changePassword } from '@/lib/session';

const MIN = 6;

/** Смена пароля личного кабинета (в «Настройках» → «Аккаунт»). */
export function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const curId = useId();
  const nextId = useId();

  const submit = async () => {
    if (next.length < MIN)
      return setMessage({ ok: false, text: `Новый пароль — не короче ${MIN} символов` });
    setBusy(true);
    setMessage(null);
    try {
      await changePassword(current, next);
      setMessage({ ok: true, text: 'Пароль изменён. На других устройствах нужно войти заново.' });
      setCurrent('');
      setNext('');
      setOpen(false);
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {!open ? (
        <div>
          <Button
            size="sm"
            variant="secondary"
            icon={<KeyRound size={16} />}
            onClick={() => {
              setOpen(true);
              setMessage(null);
            }}
          >
            Сменить пароль
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-2 rounded-control border border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label htmlFor={curId} className="text-xs font-medium text-heading">
            Текущий пароль
          </label>
          <input
            id={curId}
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={cn(fieldClass, 'h-10 text-sm')}
          />
          <label htmlFor={nextId} className="text-xs font-medium text-heading">
            Новый пароль (не короче {MIN} символов)
          </label>
          <input
            id={nextId}
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className={cn(fieldClass, 'h-10 text-sm')}
          />
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" type="submit" disabled={busy}>
              {busy ? 'Сохраняю…' : 'Сохранить'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Отмена
            </Button>
          </div>
        </form>
      )}
      {message && (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={cn('text-xs', message.ok ? 'text-fg-muted' : 'font-medium text-heading')}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
