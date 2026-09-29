import { Check, Copy, KeyRound, ShieldCheck } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import type { User } from '@app/shared';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { fieldClass } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { newRecoveryPhrase } from '@/lib/session';

/**
 * Фраза из 6 слов для восстановления доступа (ТЗ v4.18). Показывается один раз: при регистрации,
 * после «Забыли пароль?» и когда человек создаёт новую в «Настройках». Дальше — только кнопкой
 * «Продолжить» после отметки «Я сохранил(а) фразу».
 */
export function PhraseCard({
  phrase,
  lead,
  onDone,
  doneLabel = 'Продолжить',
}: {
  phrase: string;
  lead: string;
  onDone: () => void;
  doneLabel?: string;
}) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const checkId = useId();
  const words = phrase.split(' ');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(phrase);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">{lead}</p>
      <ol
        aria-label="Фраза для восстановления"
        className="grid grid-cols-2 gap-2 rounded-card border border-line bg-sunken p-3 sm:grid-cols-3"
      >
        {words.map((w, i) => (
          <li key={i} className="flex items-baseline gap-2 rounded-control bg-surface px-2.5 py-2">
            <span className="w-4 text-right text-xs text-fg-muted tabular-nums" aria-hidden>
              {i + 1}
            </span>
            <span className="font-medium text-heading select-all">{w}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          icon={copied ? <Check size={16} /> : <Copy size={16} />}
          onClick={() => void copy()}
        >
          {copied ? 'Скопировано' : 'Скопировать'}
        </Button>
        <span className="sr-only" aria-live="polite">
          {copied ? 'Фраза скопирована' : ''}
        </span>
      </div>
      <p className="flex items-start gap-1.5 text-xs text-fg-muted">
        <ShieldCheck size={14} aria-hidden className="mt-px shrink-0" />
        Запишите на бумаге или сохраните в менеджере паролей. По нику и этой фразе можно задать
        новый пароль, если забудете старый. Мы показываем её один раз и храним только в
        зашифрованном виде — никому её не сообщайте.
      </p>
      <label
        htmlFor={checkId}
        className="flex cursor-pointer items-center gap-2 text-sm font-medium text-heading"
      >
        <input
          id={checkId}
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="size-4 accent-[var(--primary)]"
        />
        Я сохранил(а) фразу
      </label>
      <Button disabled={!saved} onClick={onDone}>
        {doneLabel}
      </Button>
    </div>
  );
}

/** «Настройки» → «Аккаунт»: есть ли фраза, создать новую (нужен пароль). */
export function RecoverySettings({ user }: { user: User }) {
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phrase, setPhrase] = useState<string | null>(null);
  const pwId = useId();

  useEffect(() => {
    if (!asking) {
      setPassword('');
      setError(null);
    }
  }, [asking]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      setPhrase(await newRecoveryPhrase(password));
      setAsking(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        {user.hasRecovery ? (
          <>
            Фраза для восстановления доступа создана
            {user.recoveryAt ? ` ${formatDate(user.recoveryAt)}` : ''}.
          </>
        ) : (
          <span className="font-medium text-heading">
            Фразы для восстановления доступа нет — если забудете пароль, войти не получится.
          </span>
        )}
      </p>
      {!user.username && (
        <p className="text-xs text-fg-muted">
          Восстановить доступ можно по нику — сначала выберите его выше.
        </p>
      )}
      {!asking ? (
        <div>
          <Button
            size="sm"
            variant="secondary"
            icon={<KeyRound size={16} />}
            onClick={() => setAsking(true)}
          >
            {user.hasRecovery ? 'Создать новую фразу' : 'Создать фразу'}
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-2 rounded-control border border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label htmlFor={pwId} className="text-xs font-medium text-heading">
            Ваш пароль
          </label>
          <input
            id={pwId}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={cn(fieldClass, 'h-10 text-sm')}
          />
          {user.hasRecovery && (
            <p className="text-xs text-fg-muted">Старая фраза перестанет работать.</p>
          )}
          {error && (
            <p role="alert" className="text-sm font-medium text-heading">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" type="submit" disabled={busy || !password}>
              {busy ? 'Создаю…' : 'Показать новую фразу'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
              Отмена
            </Button>
          </div>
        </form>
      )}
      <Dialog
        open={phrase !== null}
        onClose={() => setPhrase(null)}
        title="Новая фраза для восстановления"
      >
        {phrase && (
          <PhraseCard
            phrase={phrase}
            lead="Старая фраза больше не работает. Сохраните новую:"
            doneLabel="Готово"
            onDone={() => setPhrase(null)}
          />
        )}
      </Dialog>
    </div>
  );
}
