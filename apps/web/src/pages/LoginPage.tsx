import type { UserRole } from '@app/shared';
import { Eye, EyeOff, Headset, LogIn, UserPlus, UserRound } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Logo } from '@/brand/Logo';
import { MadeBy } from '@/brand/MadeBy';
import { Button } from '@/components/ui/Button';
import { fieldClass } from '@/components/ui/Field';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { cn } from '@/lib/cn';
import { checkAccount, login } from '@/lib/session';
import { safeStorage } from '@/lib/storage';

const LAST_NAME = 'kc-last-name';
const PASSWORD_MIN = 6;

const ROLES: { id: UserRole; label: string; hint: string; icon: typeof UserRound }[] = [
  { id: 'employee', label: 'Сотрудник', hint: 'Пишу обращения', icon: UserRound },
  { id: 'specialist', label: 'Специалист', hint: 'Отвечаю на обращения', icon: Headset },
];

/** new — такого кабинета нет; legacy — есть, но без пароля (создан раньше); existing — есть с паролем. */
type Account = 'new' | 'legacy' | 'existing' | null;

/**
 * Вход в личный кабинет (ТЗ v4.6, п. 15): имя + пароль. Новое имя — новый кабинет, пароль
 * придумывается сразу. Кабинет видит только его хозяин. Специалист ещё вводит код доступа.
 */
export function LoginPage() {
  const [name, setName] = useState(() => safeStorage.get(LAST_NAME) ?? '');
  const [role, setRole] = useState<UserRole>('employee');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [account, setAccount] = useState<Account>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameId = useId();
  const statusId = useId();
  const codeId = useId();
  const passwordId = useId();
  const passwordHintId = useId();
  const errorId = useId();

  // есть ли кабинет с таким именем — чтобы попросить придумать или ввести пароль
  useEffect(() => {
    const clean = name.trim();
    if (!clean) return setAccount(null);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const r = await checkAccount(clean, role, ctrl.signal);
      if (!ctrl.signal.aborted)
        setAccount(r ? (!r.exists ? 'new' : r.hasPassword ? 'existing' : 'legacy') : null);
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [name, role]);

  const creating = account === 'new' || account === 'legacy';

  const submit = async () => {
    const clean = name.trim();
    if (!clean) return setError('Введите имя');
    if (role === 'specialist' && !code.trim()) return setError('Введите код специалиста');
    if (!password) return setError(creating ? 'Придумайте пароль' : 'Введите пароль');
    if (creating && password.length < PASSWORD_MIN)
      return setError(`Пароль — не короче ${PASSWORD_MIN} символов`);
    setBusy(true);
    setError(null);
    try {
      await login(clean, role, password, role === 'specialist' ? code.trim() : undefined);
      safeStorage.set(LAST_NAME, clean);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const status =
    account === 'new'
      ? 'Новый личный кабинет — придумайте пароль.'
      : account === 'legacy'
        ? 'Этому кабинету ещё не задан пароль — придумайте его сейчас.'
        : account === 'existing'
          ? 'С возвращением! Введите пароль.'
          : '';

  return (
    <div className="scroll-paper flex min-h-dvh flex-col bg-canvas">
      <div className="flex justify-end p-3">
        <ThemeToggle />
      </div>
      <main className="flex flex-1 items-start justify-center px-4 pt-6 pb-12 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <Logo variant="full" size={40} />
            <p className="text-sm text-fg-muted">
              ИИ-помощник поддержки: каждое обращение — карточка на доске
            </p>
          </div>

          <form
            className="flex flex-col gap-5 rounded-panel border border-line bg-surface p-5 shadow-card"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            aria-describedby={error ? errorId : undefined}
          >
            <h1 className="text-xl text-heading">Вход в личный кабинет</h1>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={nameId} className="text-sm font-medium text-heading">
                Как вас зовут?
              </label>
              <input
                id={nameId}
                value={name}
                maxLength={40}
                autoComplete="username"
                // eslint-disable-next-line jsx-a11y/no-autofocus -- первое поле экрана входа
                autoFocus
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: Анна Петрова"
                aria-describedby={statusId}
                className={cn(fieldClass, 'h-11')}
              />
              <p id={statusId} aria-live="polite" className="min-h-4 text-xs text-fg-muted">
                {status}
              </p>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-sm font-medium text-heading">Я вхожу как</legend>
              <div className="grid grid-cols-2 gap-2">
                {ROLES.map(({ id, label, hint, icon: Icon }) => (
                  <label
                    key={id}
                    className={cn(
                      'flex cursor-pointer flex-col gap-1 rounded-control border p-3 transition-colors duration-200',
                      'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
                      role === id
                        ? 'border-accent bg-accent-soft text-on-accent-soft'
                        : 'border-line text-fg hover:bg-sunken',
                    )}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={id}
                      checked={role === id}
                      onChange={() => setRole(id)}
                      className="sr-only"
                    />
                    <span className="flex items-center gap-2 font-medium">
                      <Icon size={16} aria-hidden />
                      {label}
                    </span>
                    <span className="text-xs">{hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {role === 'specialist' && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={codeId} className="text-sm font-medium text-heading">
                  Код специалиста
                </label>
                <input
                  id={codeId}
                  value={code}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  onChange={(e) => setCode(e.target.value)}
                  className={cn(fieldClass, 'h-11 tracking-widest')}
                />
                <p className="text-xs text-fg-muted">
                  Код показан в окне запуска Канбата. Спросите у того, кто его запустил.
                  Администратор организации вводит здесь код администратора.
                </p>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor={passwordId} className="text-sm font-medium text-heading">
                {creating ? 'Придумайте пароль' : 'Пароль'}
              </label>
              <div className="relative">
                <input
                  id={passwordId}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  maxLength={100}
                  autoComplete={creating ? 'new-password' : 'current-password'}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-describedby={creating ? passwordHintId : undefined}
                  className={cn(fieldClass, 'h-11 pr-12')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  aria-pressed={showPassword}
                  className="absolute top-1/2 right-1 inline-grid size-9 -translate-y-1/2 place-items-center rounded-control text-fg-muted transition-colors duration-200 hover:bg-sunken hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
                >
                  {showPassword ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                </button>
              </div>
              {creating && (
                <p id={passwordHintId} className="text-xs text-fg-muted">
                  Не короче {PASSWORD_MIN} символов. Запомните его: по имени и паролю кабинет
                  откроется с любого устройства.
                </p>
              )}
            </div>

            {error && (
              <p id={errorId} role="alert" className="text-sm font-medium text-heading">
                {error}
              </p>
            )}

            <Button
              type="submit"
              icon={creating ? <UserPlus size={18} /> : <LogIn size={18} />}
              disabled={busy}
            >
              {busy ? 'Входим…' : creating ? 'Создать кабинет' : 'Войти'}
            </Button>
            <p className="text-xs text-fg-muted">
              Кабинет видите только вы: обращения, разделы и переписку с ИИ. Специалист видит лишь
              переданные ему заявки — со сводкой.
            </p>
          </form>
        </div>
      </main>
      <footer className="flex justify-center px-4 pb-5">
        <MadeBy />
      </footer>
    </div>
  );
}
