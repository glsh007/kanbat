import type { User } from '@app/shared';
import { useEffect, useId, useState } from 'react';
import { formatDate } from '@/lib/format';
import { saveAutoDelete } from '@/lib/session';

const YEAR = 365 * 24 * 3_600_000;

/** «Удалить аккаунт после года без входа» (ТЗ v4.18). По умолчанию выключено. */
export function AutoDelete({ user }: { user: User }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // отметка меняется сразу; не сохранилось — возвращается обратно
  const [on, setOn] = useState(!!user.autoDelete);
  useEffect(() => setOn(!!user.autoDelete), [user.autoDelete]);
  const id = useId();
  const hintId = useId();
  const seen = user.lastActiveAt ?? user.createdAt;
  const until = new Date(Date.parse(seen) + YEAR).toISOString();

  const toggle = async (next: boolean) => {
    setOn(next);
    setBusy(true);
    setError(null);
    try {
      await saveAutoDelete(next);
    } catch (e) {
      setOn(!next);
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
          checked={on}
          disabled={busy}
          aria-describedby={hintId}
          onChange={(e) => void toggle(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
        />
        <span className="font-medium text-heading">
          Удалить аккаунт, если я не захожу в Канбат год
        </span>
      </label>
      <p id={hintId} className="pl-6 text-xs text-fg-muted" aria-live="polite">
        {on
          ? `Включено. Если вы не зайдёте до ${formatDate(until)}, аккаунт удалится со всеми обращениями, переписками и темами на Бат-Форуме. Каждый вход продлевает срок. Предупредить заранее мы не сможем — у Канбата нет вашей почты.`
          : 'Выключено: аккаунт хранится, пока вы сами его не удалите.'}
      </p>
      {error && (
        <p role="alert" className="pl-6 text-sm font-medium text-heading">
          {error}
        </p>
      )}
    </div>
  );
}
