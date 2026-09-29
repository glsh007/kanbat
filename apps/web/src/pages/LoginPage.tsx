import type { UserRole } from '@app/shared';
import {
  ArrowLeft,
  AtSign,
  Eye,
  EyeOff,
  Headset,
  KeyRound,
  LogIn,
  UserPlus,
  UserRound,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Logo } from '@/brand/Logo';
import { MadeBy } from '@/brand/MadeBy';
import { Button } from '@/components/ui/Button';
import { fieldClass } from '@/components/ui/Field';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { cn } from '@/lib/cn';
import { PhraseCard } from '@/features/account/RecoveryPhrase';
import { login, recoverAccess, register, usernameStatus } from '@/lib/session';
import { safeStorage } from '@/lib/storage';

const LAST_LOGIN = 'kc-last-name';
const PASSWORD_MIN = 6;

const ROLES: { id: UserRole; label: string; hint: string; icon: typeof UserRound }[] = [
  { id: 'employee', label: 'Пользователь', hint: 'Пишу обращения', icon: UserRound },
  { id: 'specialist', label: 'Специалист', hint: 'Отвечаю на обращения', icon: Headset },
];

type Mode = 'login' | 'register' | 'recover';

/** Фраза показывается один раз — после регистрации или восстановления, до входа. */
type PhraseStep = { phrase: string; title: string; lead: string; done: () => void };

const TRANSLIT: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};
/** Подсказка ника из имени: «Анна Петрова» → anna_petrova. */
function suggestNick(name: string): string {
  const latin = [...name.toLowerCase()].map((c) => TRANSLIT[c] ?? c).join('');
  const nick = latin
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[^a-z]+/, '')
    .slice(0, 20);
  return nick.length >= 3 ? nick : '';
}

/**
 * Вход и регистрация (ТЗ v4.17, п. 15). Регистрация — явная: имя, уникальный ник, пароль с повтором,
 * роль (специалисту — код). Вход — по нику; кабинеты до регистрации — по имени, как раньше.
 * Почту не спрашиваем: для писем нужен почтовый сервер — это следующий шаг.
 */
export function LoginPage() {
  const last = safeStorage.get(LAST_LOGIN) ?? '';
  const [mode, setMode] = useState<Mode>(last ? 'login' : 'register');
  const [loginName, setLoginName] = useState(last);
  const [name, setName] = useState('');
  const [nick, setNick] = useState('');
  const [nickTouched, setNickTouched] = useState(false);
  const [nickState, setNickState] = useState<{ ok: boolean; text: string } | null>(null);
  const [role, setRole] = useState<UserRole>('employee');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phraseInput, setPhraseInput] = useState('');
  const [step, setStep] = useState<PhraseStep | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const ids = {
    phrase: useId(),
    login: useId(),
    name: useId(),
    nick: useId(),
    nickStatus: useId(),
    code: useId(),
    password: useId(),
    passwordHint: useId(),
    repeat: useId(),
    error: useId(),
  };

  // ник подсказывается из имени, пока человек не начал писать его сам
  useEffect(() => {
    if (!nickTouched) setNick(suggestNick(name));
  }, [name, nickTouched]);

  // свободен ли ник — на лету
  useEffect(() => {
    if (mode !== 'register') return;
    const u = nick.trim().replace(/^@/, '');
    if (!u) return setNickState(null);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const r = await usernameStatus(u, ctrl.signal);
      if (!ctrl.signal.aborted && r)
        setNickState(
          r.available
            ? { ok: true, text: `@${u.toLowerCase()} свободен` }
            : { ok: false, text: r.reason ?? 'Не подходит' },
        );
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [nick, mode]);

  // автофокус поля «Ник» — только при первом открытии, не при смене вкладки
  const firstOpen = useRef(true);
  useEffect(() => {
    firstOpen.current = false;
  }, []);

  const switchTo = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
    setPassword('');
    setRepeat('');
    setPhraseInput('');
  };

  const submit = async () => {
    setError(null);
    if (mode === 'recover') {
      const who = loginName.trim();
      if (!who) return setError('Введите ник');
      if (
        phraseInput
          .trim()
          .split(/[^а-яёa-z]+/i)
          .filter(Boolean).length !== 6
      )
        return setError('Во фразе 6 слов — проверьте, все ли введены');
      if (password.length < PASSWORD_MIN)
        return setError(`Новый пароль — не короче ${PASSWORD_MIN} символов`);
      if (password !== repeat) return setError('Пароли не совпадают');
      setBusy(true);
      try {
        const r = await recoverAccess(who, phraseInput, password);
        setBusy(false);
        setStep({
          phrase: r.recoveryPhrase,
          title: 'Пароль изменён',
          lead: 'Старая фраза больше не работает — её могли подсмотреть. Вот новая:',
          done: () => {
            setStep(null);
            setLoginName(r.username);
            setRole(r.role);
            switchTo('login');
            setNotice('Готово. Войдите с новым паролем — на других устройствах вход закрыт.');
          },
        });
      } catch (e) {
        setError((e as Error).message);
        setBusy(false);
      }
      return;
    }
    if (role === 'specialist' && !code.trim()) return setError('Введите код специалиста');
    if (mode === 'login') {
      const who = loginName.trim();
      if (!who) return setError('Введите ник');
      if (!password) return setError('Введите пароль');
      setBusy(true);
      try {
        await login(who, role, password, role === 'specialist' ? code.trim() : undefined);
        safeStorage.set(LAST_LOGIN, who);
      } catch (e) {
        setError((e as Error).message);
        setBusy(false);
      }
      return;
    }
    if (name.trim().length < 2) return setError('Как к вам обращаться? Не короче 2 символов');
    if (!nick.trim()) return setError('Придумайте ник');
    if (nickState && !nickState.ok) return setError(nickState.text);
    if (password.length < PASSWORD_MIN)
      return setError(`Пароль — не короче ${PASSWORD_MIN} символов`);
    if (password !== repeat) return setError('Пароли не совпадают');
    setBusy(true);
    try {
      const r = await register({
        name: name.trim(),
        username: nick.trim(),
        password,
        role,
        code: role === 'specialist' ? code.trim() : undefined,
      });
      safeStorage.set(LAST_LOGIN, r.user.username ?? nick.trim());
      setBusy(false);
      if (!r.phrase) return r.commit();
      setStep({
        phrase: r.phrase,
        title: 'Кабинет создан',
        lead: 'Последний шаг — сохраните фразу для восстановления доступа. Она понадобится, если вы забудете пароль.',
        done: r.commit,
      });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const reg = mode === 'register';
  const rec = mode === 'recover';

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

          {step ? (
            <section
              aria-labelledby="phrase-title"
              className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-5 shadow-card"
            >
              <h1 id="phrase-title" className="text-xl text-heading">
                {step.title}
              </h1>
              <PhraseCard phrase={step.phrase} lead={step.lead} onDone={step.done} />
            </section>
          ) : rec ? (
            <form
              aria-labelledby="recover-title"
              className="flex flex-col gap-5 rounded-panel border border-line bg-surface p-5 shadow-card"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
              aria-describedby={error ? ids.error : undefined}
            >
              <div>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<ArrowLeft size={16} />}
                  onClick={() => switchTo('login')}
                >
                  Ко входу
                </Button>
              </div>
              <h1 id="recover-title" className="text-xl text-heading">
                Восстановление доступа
              </h1>
              <p className="text-sm text-fg-muted">
                Введите ник и фразу из 6 слов, которую Канбат показал при регистрации, и придумайте
                новый пароль.
              </p>
              <Field id={ids.login} label="Ник">
                <input
                  id={ids.login}
                  value={loginName}
                  maxLength={40}
                  autoComplete="username"
                  autoCapitalize="none"
                  onChange={(e) => setLoginName(e.target.value)}
                  placeholder="anna_petrova"
                  className={cn(fieldClass, 'h-11')}
                />
              </Field>
              <Field
                id={ids.phrase}
                label="Фраза из 6 слов"
                hint="Через пробел, в том же порядке. Заглавные буквы и «ё» не важны."
              >
                <textarea
                  id={ids.phrase}
                  rows={2}
                  value={phraseInput}
                  maxLength={200}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  onChange={(e) => setPhraseInput(e.target.value)}
                  placeholder="сова ручей мост …"
                  className={cn(fieldClass, 'resize-none py-2 leading-snug')}
                />
              </Field>
              <Field
                id={ids.password}
                label="Новый пароль"
                hint={`Не короче ${PASSWORD_MIN} символов.`}
              >
                <input
                  id={ids.password}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  maxLength={100}
                  autoComplete="new-password"
                  onChange={(e) => setPassword(e.target.value)}
                  className={cn(fieldClass, 'h-11')}
                />
              </Field>
              <Field id={ids.repeat} label="Повторите новый пароль">
                <input
                  id={ids.repeat}
                  type={showPassword ? 'text' : 'password'}
                  value={repeat}
                  maxLength={100}
                  autoComplete="new-password"
                  onChange={(e) => setRepeat(e.target.value)}
                  className={cn(fieldClass, 'h-11')}
                />
              </Field>
              {error && (
                <p id={ids.error} role="alert" className="text-sm font-medium text-heading">
                  {error}
                </p>
              )}
              <Button type="submit" icon={<KeyRound size={18} />} disabled={busy}>
                {busy ? 'Проверяю…' : 'Сменить пароль'}
              </Button>
              <p className="text-xs text-fg-muted">
                Фразы нет или она потерялась? Тогда пароль сменить нельзя: Канбат не знает вашу
                почту и телефон. Можно зарегистрировать новый кабинет.
              </p>
            </form>
          ) : (
            <div className="rounded-panel border border-line bg-surface shadow-card">
              <div
                role="tablist"
                aria-label="Вход или регистрация"
                className="grid grid-cols-2 border-b border-line"
              >
                {(
                  [
                    ['login', 'Вход'],
                    ['register', 'Регистрация'],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    id={`auth-tab-${m}`}
                    aria-selected={mode === m}
                    aria-controls="auth-panel"
                    // стандарт ARIA: в порядке Tab только активная вкладка, между вкладками — стрелки
                    tabIndex={mode === m ? 0 : -1}
                    onClick={() => switchTo(m)}
                    onKeyDown={(e) => {
                      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
                      e.preventDefault();
                      const next: Mode =
                        e.key === 'Home'
                          ? 'login'
                          : e.key === 'End'
                            ? 'register'
                            : m === 'login'
                              ? 'register'
                              : 'login';
                      switchTo(next);
                      document.getElementById(`auth-tab-${next}`)?.focus();
                    }}
                    className={cn(
                      'h-12 text-sm font-medium transition-colors duration-200',
                      'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus',
                      mode === m
                        ? 'border-b-2 border-primary-border text-heading'
                        : 'text-fg-muted hover:text-fg',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <form
                role="tabpanel"
                id="auth-panel"
                aria-labelledby={`auth-tab-${mode}`}
                className="flex flex-col gap-5 p-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
                aria-describedby={error ? ids.error : undefined}
              >
                <h1 className="text-xl text-heading">
                  {reg ? 'Новый личный кабинет' : 'Вход в личный кабинет'}
                </h1>
                {notice && !reg && (
                  <p
                    role="status"
                    className="rounded-control bg-accent-soft px-3 py-2 text-sm text-on-accent-soft"
                  >
                    {notice}
                  </p>
                )}

                {reg ? (
                  <>
                    <Field id={ids.name} label="Как к вам обращаться?">
                      <input
                        id={ids.name}
                        value={name}
                        maxLength={40}
                        autoComplete="name"
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Например: Анна Петрова"
                        className={cn(fieldClass, 'h-11')}
                      />
                    </Field>
                    <Field
                      id={ids.nick}
                      label="Ник"
                      hint={
                        <span
                          id={ids.nickStatus}
                          aria-live="polite"
                          className={cn(nickState && !nickState.ok && 'font-medium text-heading')}
                        >
                          {nickState?.text ??
                            'Латиница, цифры и «_», 3–20 символов. По нику вы входите в Канбат.'}
                        </span>
                      }
                    >
                      <div className="relative">
                        <AtSign
                          size={16}
                          aria-hidden
                          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted"
                        />
                        <input
                          id={ids.nick}
                          value={nick}
                          maxLength={21}
                          autoComplete="username"
                          autoCapitalize="none"
                          spellCheck={false}
                          aria-describedby={ids.nickStatus}
                          aria-invalid={nickState ? !nickState.ok : undefined}
                          onChange={(e) => {
                            setNickTouched(true);
                            setNick(e.target.value.replace(/\s/g, ''));
                          }}
                          placeholder="anna_petrova"
                          className={cn(fieldClass, 'h-11 pl-9')}
                        />
                      </div>
                    </Field>
                  </>
                ) : (
                  <Field
                    id={ids.login}
                    label="Ник"
                    hint="Кабинеты, созданные до регистрации, — по имени, как раньше."
                  >
                    <input
                      id={ids.login}
                      value={loginName}
                      maxLength={40}
                      autoComplete="username"
                      autoCapitalize="none"
                      // только при открытии страницы: при переключении вкладок фокус остаётся на вкладке
                      // eslint-disable-next-line jsx-a11y/no-autofocus -- первое поле экрана входа
                      autoFocus={firstOpen.current}
                      onChange={(e) => setLoginName(e.target.value)}
                      placeholder="anna_petrova"
                      className={cn(fieldClass, 'h-11')}
                    />
                  </Field>
                )}

                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1.5 text-sm font-medium text-heading">
                    {reg ? 'Я буду' : 'Я вхожу как'}
                  </legend>
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
                  <Field
                    id={ids.code}
                    label="Код специалиста"
                    hint="Код показан в окне запуска Канбата. Администратор организации вводит здесь код администратора."
                  >
                    <input
                      id={ids.code}
                      value={code}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      onChange={(e) => setCode(e.target.value)}
                      className={cn(fieldClass, 'h-11 tracking-widest')}
                    />
                  </Field>
                )}

                <Field
                  id={ids.password}
                  label={reg ? 'Придумайте пароль' : 'Пароль'}
                  hint={reg ? `Не короче ${PASSWORD_MIN} символов.` : undefined}
                >
                  <div className="relative">
                    <input
                      id={ids.password}
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      maxLength={100}
                      autoComplete={reg ? 'new-password' : 'current-password'}
                      onChange={(e) => setPassword(e.target.value)}
                      className={cn(fieldClass, 'h-11 pr-12')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                      aria-pressed={showPassword}
                      className="absolute top-1/2 right-1 inline-grid size-9 -translate-y-1/2 place-items-center rounded-control text-fg-muted transition-colors duration-200 hover:bg-sunken hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
                    >
                      {showPassword ? (
                        <EyeOff size={18} aria-hidden />
                      ) : (
                        <Eye size={18} aria-hidden />
                      )}
                    </button>
                  </div>
                </Field>

                {!reg && (
                  <div className="-mt-3">
                    <button
                      type="button"
                      onClick={() => switchTo('recover')}
                      className="rounded-[4px] text-sm font-medium text-fg underline underline-offset-4 hover:text-heading focus-visible:outline-2 focus-visible:outline-focus"
                    >
                      Забыли пароль?
                    </button>
                  </div>
                )}

                {reg && (
                  <Field id={ids.repeat} label="Повторите пароль">
                    <input
                      id={ids.repeat}
                      type={showPassword ? 'text' : 'password'}
                      value={repeat}
                      maxLength={100}
                      autoComplete="new-password"
                      onChange={(e) => setRepeat(e.target.value)}
                      className={cn(fieldClass, 'h-11')}
                    />
                  </Field>
                )}

                {error && (
                  <p id={ids.error} role="alert" className="text-sm font-medium text-heading">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  icon={reg ? <UserPlus size={18} /> : <LogIn size={18} />}
                  disabled={busy}
                >
                  {busy
                    ? reg
                      ? 'Регистрируем…'
                      : 'Входим…'
                    : reg
                      ? 'Зарегистрироваться'
                      : 'Войти'}
                </Button>
                <p className="text-xs text-fg-muted">
                  {reg
                    ? 'Храним только имя, ник, роль и зашифрованный пароль — почта не нужна. Кабинет видите только вы.'
                    : 'Кабинет видите только вы: обращения, разделы и переписку с ИИ. Специалист видит лишь переданные ему заявки — со сводкой.'}
                </p>
              </form>
            </div>
          )}
        </div>
      </main>
      <footer className="flex justify-center px-4 pb-5">
        <MadeBy />
      </footer>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-heading">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-fg-muted">{hint}</p>}
    </div>
  );
}
