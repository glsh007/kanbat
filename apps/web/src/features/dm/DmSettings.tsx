import type { User } from '@app/shared';
import { useEffect, useId, useState } from 'react';
import { saveDmOff } from '@/lib/session';

/** «Настройки» → «Бат-общение»: принимать ли личные вопросы по темам (ТЗ v4.19). */
export function DmSettings({ user }: { user: User }) {
  const [open, setOpen] = useState(!user.dmOff);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const hintId = useId();
  useEffect(() => setOpen(!user.dmOff), [user.dmOff]);

  const toggle = async (next: boolean) => {
    setOpen(next);
    setBusy(true);
    setError(null);
    try {
      await saveDmOff(!next);
    } catch (e) {
      setOpen(!next);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex cursor-pointer items-start gap-2 text-sm">
        <input
          id={id}
          type="checkbox"
          checked={open}
          disabled={busy}
          aria-describedby={hintId}
          onChange={(e) => void toggle(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
        />
        <span className="font-medium text-heading">Принимать личные вопросы</span>
      </label>
      <p id={hintId} className="pl-6 text-xs text-fg-muted">
        {open
          ? 'У ваших тем и ответов на Бат-Форуме есть кнопка «Спросить лично». Вопросы приходят в Бат-общение — не больше 3 в сутки; вы решаете, принимать ли каждый.'
          : 'Выключено: кнопки «Спросить лично» у ваших тем и ответов нет. Открытые переписки продолжаются до закрытия.'}
      </p>
      {error && (
        <p role="alert" className="pl-6 text-sm font-medium text-heading">
          {error}
        </p>
      )}
    </div>
  );
}
