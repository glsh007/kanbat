import type {
  OrgLimits,
  OrgOffTopic,
  OrgProfile,
  OrgAddress,
  OrgTemplate,
  OrgTone,
  SupportTimers,
} from '@app/shared';
import { Check, MessageSquareText, Plus, RotateCcw, Save, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { fieldClass } from '@/components/ui/Field';
import { IconButton } from '@/components/ui/IconButton';
import { useNavTitle } from '@/features/nav/useNavTitle';
import { Markdown } from '@/features/task/Markdown';
import { AppShell } from '@/layout/AppShell';
import { orgApi, serverApi } from '@/lib/api';
import { useSupportTimers } from '@/features/support/tickets';
import { CannedAnswers } from '@/features/org/CannedAnswers';
import { HardRules } from '@/features/org/HardRules';
import { AnswerSamples } from '@/features/org/AnswerSamples';
import { CheckQuestions } from '@/features/org/CheckQuestions';
import { ErrorReviews } from '@/features/org/ErrorReviews';
import { BrandSettings } from '@/features/org/BrandSettings';
import { cn } from '@/lib/cn';
import { useUser } from '@/lib/session';

/**
 * «Организация» (ТЗ v4.12, п. 17, шаг 1): администратор настраивает помощника под организацию —
 * шаблон отрасли, роль, тон, темы и «тонкости» (всегда / никогда / фраза в конце ответа)
 * и сразу проверяет ответ на вопросе, ещё до сохранения.
 */
export function OrgPage() {
  const user = useUser();
  const admin = user?.role === 'specialist' && user.admin === true;
  useNavTitle('организация');

  if (!admin)
    return (
      <AppShell title="Организация" subtitle="Настройки помощника">
        <p className="p-6 text-sm text-fg-muted">
          Доступ только для администратора организации. Войдите как специалист с кодом
          администратора.
        </p>
      </AppShell>
    );
  return <OrgEditor />;
}

const same = (a: OrgProfile | null, b: OrgProfile | null) =>
  JSON.stringify(strip(a)) === JSON.stringify(strip(b));
const strip = (p: OrgProfile | null) => p && { ...p, updatedAt: undefined, updatedBy: undefined };

function OrgEditor() {
  const [templates, setTemplates] = useState<OrgTemplate[]>([]);
  const [limits, setLimits] = useState<OrgLimits | null>(null);
  /** Сохранённый профиль (null — ещё не настроен, работает как ИТ-поддержка). */
  const [saved, setSaved] = useState<OrgProfile | null>(null);
  const [draft, setDraft] = useState<OrgProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rulesDirty, setRulesDirty] = useState(false);

  useEffect(() => {
    let alive = true;
    orgApi
      .get()
      .then((s) => {
        if (!alive) return;
        const list = s.templates ?? [];
        setTemplates(list);
        setLimits(s.limits ?? null);
        setSaved(s.profile ?? null);
        setDraft(s.profile ?? list.find((t) => t.id === 'it')?.profile ?? null);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const dirty = !!draft && (!saved || !same(saved, draft));
  const set = (patch: Partial<OrgProfile>) => {
    setFlash(null);
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  const pickTemplate = (t: OrgTemplate) =>
    // название организации и фраза в конце — не часть отрасли: оставляем введённые
    set({ ...t.profile, orgName: draft?.orgName ?? '', signature: draft?.signature ?? '' });

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const r = await orgApi.save(draft);
      if (r.profile) {
        setSaved(r.profile);
        setDraft(r.profile);
      }
      setFlash('Сохранено — помощник уже отвечает по новым правилам.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Организация" subtitle="Как помощник разговаривает с людьми">
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-5 px-3 pt-4 pb-28 sm:px-4 lg:px-6 lg:pt-6">
        {!saved && draft && (
          <p className="rounded-card border border-line bg-surface px-4 py-3 text-sm">
            Профиль ещё не сохранён: помощник работает как ИТ-поддержка компании. Выберите шаблон
            отрасли, поправьте под себя и сохраните.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm font-medium text-heading">
            {error}
          </p>
        )}
        {!draft ? (
          !error && <p className="text-sm text-fg-muted">Загрузка…</p>
        ) : (
          <>
            <Block title="Шаблон отрасли" hint="Заполняет поля ниже — дальше всё можно поменять.">
              <div
                role="radiogroup"
                aria-label="Шаблон отрасли"
                className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
              >
                {templates.map((t) => {
                  const active = draft.template === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => pickTemplate(t)}
                      className={cn(
                        'flex items-start gap-2 rounded-card border px-3 py-2.5 text-left transition-colors duration-200',
                        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
                        active
                          ? 'border-primary-border bg-accent-soft'
                          : 'border-line bg-surface hover:border-line-strong',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-heading">{t.title}</span>
                        <span className="block text-xs text-fg-muted">{t.description}</span>
                      </span>
                      {active && <Check size={16} className="mt-0.5 shrink-0" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            </Block>

            <Block title="Помощник">
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Название организации"
                  hint="Можно не заполнять"
                  value={draft.orgName}
                  max={limits?.orgName}
                  onChange={(v) => set({ orgName: v })}
                />
                <TextField
                  label="Имя помощника"
                  value={draft.assistantName}
                  max={limits?.assistantName}
                  onChange={(v) => set({ assistantName: v })}
                />
              </div>
              <TextField
                label="Роль"
                hint="Кто помощник и для кого работает"
                multiline
                value={draft.role}
                max={limits?.role}
                onChange={(v) => set({ role: v })}
              />
              <TextField
                label="С чем помогает"
                hint="Темы через запятую — помощник называет их на «что ты умеешь»"
                multiline
                rows={2}
                value={draft.scope}
                max={limits?.scope}
                onChange={(v) => set({ scope: v })}
              />
              <Choice<OrgAddress>
                label="Обращение"
                value={draft.address}
                onChange={(v) => set({ address: v })}
                options={[
                  ['vy', 'На «вы»'],
                  ['ty', 'На «ты»'],
                ]}
              />
              <Choice<OrgTone>
                label="Тон"
                value={draft.tone}
                onChange={(v) => set({ tone: v })}
                options={[
                  ['friendly', 'Дружелюбный'],
                  ['business', 'Деловой'],
                  ['brief', 'Краткий'],
                ]}
              />
              <Choice<OrgOffTopic>
                label="Вопросы не по теме"
                value={draft.offTopic}
                onChange={(v) => set({ offTopic: v })}
                options={[
                  ['answer', 'Отвечать коротко'],
                  ['decline', 'Вежливо отказывать'],
                ]}
              />
            </Block>

            <Block
              title="Тонкости"
              hint="Правила важнее мнения модели: помощник соблюдает их в каждом ответе."
            >
              <RuleList
                label="Всегда"
                placeholder="Например: если вопрос о заказе — попроси номер заказа"
                items={draft.always}
                max={limits?.rules ?? 10}
                maxLength={limits?.rule}
                onChange={(always) => set({ always })}
              />
              <RuleList
                label="Никогда"
                placeholder="Например: не проси данные банковской карты"
                items={draft.never}
                max={limits?.rules ?? 10}
                maxLength={limits?.rule}
                onChange={(never) => set({ never })}
              />
              <TextField
                label="Фраза в конце каждого ответа"
                hint="Не вопрос — иначе помощник будет ждать на неё ответа. Можно не заполнять."
                value={draft.signature}
                max={limits?.signature}
                onChange={(v) => set({ signature: v })}
              />
            </Block>

            <Preview profile={draft} />
          </>
        )}
        <CannedAnswers Block={Block} />
        <HardRules Block={Block} onDirtyChange={setRulesDirty} />
        <AnswerSamples Block={Block} />
        <CheckQuestions Block={Block} />
        <ErrorReviews Block={Block} />
        <BrandSettings Block={Block} />
        <SupportTimersBlock />
      </div>

      {draft && (
        <div className="sticky bottom-0 z-10 border-t border-line bg-canvas/95 backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-[880px] flex-wrap items-center gap-2 px-3 py-3 sm:px-4 lg:px-6">
            <p className="min-w-0 flex-1 text-sm text-fg-muted" aria-live="polite">
              {flash ??
                (dirty && rulesDirty
                  ? 'Есть несохранённые изменения. Жёсткие правила сохраняются своей кнопкой в их блоке.'
                  : dirty
                    ? 'Есть несохранённые изменения'
                    : rulesDirty
                      ? 'Жёсткие правила не сохранены — кнопка «Сохранить правила» в их блоке'
                      : saved?.updatedAt
                        ? `Сохранено ${new Date(saved.updatedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} · ${saved.updatedBy ?? ''}`
                        : '')}
            </p>
            {saved && dirty && (
              <Button
                size="sm"
                variant="secondary"
                icon={<RotateCcw size={16} />}
                onClick={() => {
                  setDraft(saved);
                  setFlash(null);
                }}
              >
                Отменить изменения
              </Button>
            )}
            <Button
              size="sm"
              icon={<Save size={16} />}
              disabled={busy || !dirty}
              onClick={() => void save()}
            >
              {busy ? 'Сохраняю…' : 'Сохранить'}
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}

/**
 * Сроки заявок (ТЗ v4.22): через сколько заявка закрывается сама, если пользователь молчит после ответа,
 * и через сколько принятая заявка без ответа возвращается в общую очередь. Сохраняются сразу.
 */
function SupportTimersBlock() {
  const [timers, setTimers] = useState<SupportTimers | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    serverApi
      .supportSettings()
      .then((t) => alive && setTimers(t))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const save = async (patch: Partial<SupportTimers>) => {
    if (!timers) return;
    const prev = timers;
    setTimers({ ...timers, ...patch });
    setError(null);
    try {
      const t = await serverApi.saveSupportSettings(patch);
      setTimers(t);
      useSupportTimers.setState(t);
      setNote('Сохранено — действует для всех заявок.');
    } catch (e) {
      setTimers(prev);
      setError((e as Error).message);
    }
  };

  return (
    <Block
      title="Сроки заявок"
      hint="Заявку закрывает пользователь («Закрыть вопрос») или срок. Меняется сразу, без кнопки «Сохранить»."
    >
      {!timers ? (
        <p className="text-sm text-fg-muted">{error ?? 'Загрузка…'}</p>
      ) : (
        <>
          <Choice
            label="Автозакрытие: пользователь молчит после ответа специалиста"
            value={String(timers.closeHours) as '4' | '24' | '72'}
            onChange={(v) => void save({ closeHours: Number(v) as SupportTimers['closeHours'] })}
            options={[
              ['4', '4 часа'],
              ['24', '24 часа'],
              ['72', '3 дня'],
            ]}
          />
          <Choice
            label="Автовозврат в общую очередь: принятая заявка без ответа"
            value={String(timers.returnHours) as '2' | '4' | '8'}
            onChange={(v) => void save({ returnHours: Number(v) as SupportTimers['returnHours'] })}
            options={[
              ['2', '2 часа'],
              ['4', '4 часа'],
              ['8', '8 часов'],
            ]}
          />
          <p className="text-xs text-fg-muted" aria-live="polite">
            {error ??
              note ??
              'За несколько часов до автозакрытия пользователь получит напоминание в чате.'}
          </p>
        </>
      )}
    </Block>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4 sm:p-5"
    >
      <div>
        <h2 id={id} className="font-serif text-lg text-heading">
          {title}
        </h2>
        {hint && <p className="text-xs text-fg-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function TextField({
  label,
  hint,
  value,
  onChange,
  max,
  multiline = false,
  rows = 3,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  max?: number;
  multiline?: boolean;
  rows?: number;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const common = {
    id,
    value,
    maxLength: max,
    'aria-describedby': hint ? hintId : undefined,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
  };
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-heading">
        {label}
      </label>
      {multiline ? (
        <textarea
          {...common}
          rows={rows}
          className={cn(fieldClass, 'resize-y py-2 leading-snug')}
        />
      ) : (
        <input {...common} className={cn(fieldClass, 'h-11')} />
      )}
      {hint && (
        <p id={hintId} className="text-xs text-fg-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

function Choice<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <span id={id} className="text-sm font-medium text-heading">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={id}
        className="flex flex-wrap gap-1 rounded-control border border-line bg-sunken p-0.5 sm:self-start"
      >
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={cn(
              'h-9 flex-1 rounded-[10px] px-3 text-sm whitespace-nowrap transition-colors duration-200 sm:flex-none',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
              value === v
                ? 'bg-surface font-medium text-heading shadow-card'
                : 'text-fg-muted hover:text-fg',
            )}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function RuleList({
  label,
  placeholder,
  items,
  max,
  maxLength,
  onChange,
}: {
  label: string;
  placeholder: string;
  items: string[];
  max: number;
  maxLength?: number;
  onChange: (items: string[]) => void;
}) {
  const id = useId();
  const last = useRef<HTMLInputElement>(null);
  const [focusLast, setFocusLast] = useState(false);
  useEffect(() => {
    if (focusLast) last.current?.focus();
    setFocusLast(false);
  }, [focusLast]);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend id={id} className="mb-1 text-sm font-medium text-heading">
        {label}
      </legend>
      {items.length === 0 && <p className="text-xs text-fg-muted">Пока нет правил.</p>}
      <ul className="flex flex-col gap-2">
        {items.map((x, i) => (
          <li key={i} className="flex items-center gap-1">
            <input
              ref={i === items.length - 1 ? last : undefined}
              value={x}
              maxLength={maxLength}
              aria-label={`${label}: правило ${i + 1}`}
              placeholder={placeholder}
              onChange={(e) => onChange(items.map((y, j) => (j === i ? e.target.value : y)))}
              className={cn(fieldClass, 'h-11 min-w-0 flex-1')}
            />
            <IconButton
              label={`Удалить правило ${i + 1} («${label}»)`}
              icon={<X size={18} />}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            />
          </li>
        ))}
      </ul>
      <div>
        <Button
          size="sm"
          variant="ghost"
          icon={<Plus size={16} />}
          disabled={items.length >= max}
          onClick={() => {
            onChange([...items, '']);
            setFocusLast(true);
          }}
        >
          {items.length >= max ? `Не больше ${max} правил` : `Добавить правило «${label}»`}
        </Button>
      </div>
    </fieldset>
  );
}

/** Пробный ответ по черновику: видно роль, тон и тонкости до сохранения. */
function Preview({ profile }: { profile: OrgProfile }) {
  const [question, setQuestion] = useState('');
  const [reply, setReply] = useState<{ text: string; model: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  const qId = useId();
  const examples = useMemo(
    () =>
      profile.template === 'gov'
        ? ['Какие документы нужны для загранпаспорта?', 'Как установить игру на телефон?']
        : profile.template === 'shop'
          ? ['Где мой заказ?', 'Посоветуй фильм на вечер']
          : profile.template === 'games'
            ? ['Не могу войти в аккаунт', 'Верните деньги за покупку']
            : ['Что ты умеешь?', 'Не открывается почта'],
    [profile.template],
  );
  useEffect(() => () => ctrl.current?.abort(), []);

  const ask = async () => {
    const q = question.trim();
    if (!q) return;
    ctrl.current?.abort();
    ctrl.current = new AbortController();
    setBusy(true);
    setError(null);
    setReply(null);
    try {
      const r = await orgApi.preview(profile, q, null, ctrl.current.signal);
      setReply({ text: r.reply, model: r.model });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Block
      title="Проверить на вопросе"
      hint="Ответ по текущим настройкам, даже несохранённым. На доску ничего не попадает."
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={qId} className="text-sm font-medium text-heading">
          Вопрос от имени пользователя
        </label>
        <textarea
          id={qId}
          rows={2}
          value={question}
          maxLength={1000}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void ask();
          }}
          className={cn(fieldClass, 'resize-y py-2 leading-snug')}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          icon={<MessageSquareText size={16} />}
          disabled={busy || !question.trim()}
          onClick={() => void ask()}
        >
          {busy ? 'Помощник отвечает…' : 'Спросить помощника'}
        </Button>
        {examples.map((x) => (
          <Button key={x} size="sm" variant="ghost" onClick={() => setQuestion(x)}>
            {x}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-heading">
          {error}
        </p>
      )}
      <div aria-live="polite">
        {reply && (
          <div className="rounded-card border border-line bg-sunken px-4 py-3">
            <p className="mb-1 text-xs text-fg-muted">
              {profile.assistantName}
              {reply.model ? ` · ${reply.model}` : ' · демо-режим'}
            </p>
            <Markdown text={reply.text} />
          </div>
        )}
      </div>
    </Block>
  );
}
