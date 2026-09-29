import { AtSign } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { fieldClass } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import { chooseUsername, usernameStatus } from '@/lib/session';

/**
 * Ник для кабинета, созданного до регистрации (ТЗ v4.17): без ника человека не найти
 * и он не может написать первым. Задаётся один раз.
 */
export function NickSetup({ className, onDone }: { className?: string; onDone?: () => void }) {
  const [nick, setNick] = useState('');
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();
  const statusId = useId();

  useEffect(() => {
    const u = nick.trim().replace(/^@/, '');
    if (!u) return setState(null);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const r = await usernameStatus(u, ctrl.signal);
      if (!ctrl.signal.aborted && r)
        setState(
          r.available
            ? { ok: true, text: `@${u.toLowerCase()} свободен` }
            : { ok: false, text: r.reason ?? 'Не подходит' },
        );
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [nick]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await chooseUsername(nick.trim());
      onDone?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className={cn(
        'flex flex-col gap-2 rounded-card border border-line bg-surface p-4',
        className,
      )}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label htmlFor={id} className="text-sm font-medium text-heading">
        Придумайте ник — по нему вы будете входить в Канбат
      </label>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1">
          <AtSign
            size={16}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted"
          />
          <input
            id={id}
            value={nick}
            maxLength={21}
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby={statusId}
            onChange={(e) => setNick(e.target.value.replace(/\s/g, ''))}
            placeholder="anna_petrova"
            className={cn(fieldClass, 'h-11 pl-9')}
          />
        </div>
        <Button type="submit" disabled={busy || !state?.ok}>
          Сохранить ник
        </Button>
      </div>
      <p id={statusId} aria-live="polite" className="text-xs text-fg-muted">
        {state?.text ?? 'Латиница, цифры и «_», 3–20 символов. Выбирается один раз.'}
      </p>
      {error && (
        <p role="alert" className="text-sm font-medium text-heading">
          {error}
        </p>
      )}
    </form>
  );
}
