import type { CannedAnswer, CannedDraft, CannedLimits, CannedTest } from '@app/shared';
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { fieldClass } from '@/components/ui/Field';
import { IconButton } from '@/components/ui/IconButton';
import { Markdown } from '@/features/task/Markdown';
import { answersApi } from '@/lib/api';
import { cn } from '@/lib/cn';

/** Пример для пустого списка — чтобы было видно формат (шаги списком, ссылки). */
const EXAMPLE: CannedDraft = {
  title: 'Запись на приём',
  keywords: ['записаться на приём', 'запись к врачу', 'как записаться'],
  when: 'Подходит, если человек спрашивает, как записаться. Не подходит, если запись уже есть и что-то сломалось (ошибка, пропал талон).',
  body: 'Записаться можно онлайн за пару минут:\n\n1. Откройте раздел [«Запись на приём»](https://example.org/zapis).\n2. Выберите специалиста и удобное время.\n3. Подтвердите запись — талон придёт на почту.\n\nЕсли свободного времени нет, загляните завтра: расписание открывается на две недели вперёд.',
  links: [{ label: 'Записаться', url: 'https://example.org/zapis' }],
  enabled: true,
};

const EMPTY: CannedDraft = {
  title: '',
  keywords: [],
  when: '',
  body: '',
  links: [],
  enabled: true,
};

/**
 * «Готовые ответы» (ТЗ v4.25, п. 17): администратор задаёт ответ на ключевые слова. Помощник покажет
 * его дословно, только если он подходит по смыслу: сначала сервер ищет по словам, потом решает ИИ.
 */
export function CannedAnswers({
  Block,
}: {
  Block: (p: { title: string; hint?: string; children: ReactNode }) => ReactNode;
}) {
  const [list, setList] = useState<CannedAnswer[] | null>(null);
  const [limits, setLimits] = useState<CannedLimits | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; draft: CannedDraft } | null>(null);
  const [removing, setRemoving] = useState<CannedAnswer | null>(null);

  const load = () =>
    answersApi
      .list()
      .then((r) => {
        setList(r.answers);
        setLimits(r.limits);
      })
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);

  return (
    <Block
      title="Готовые ответы"
      hint="Ответ на ключевые слова — например, как записаться или где найти справку. Помощник покажет его дословно, со ссылками, но только если он подходит по смыслу; иначе ответит сам."
    >
      <TestBox disabled={!list?.length} />
      {error && (
        <p role="alert" className="text-sm font-medium text-heading">
          {error}
        </p>
      )}
      {!list ? (
        !error && <p className="text-sm text-fg-muted">Загрузка…</p>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-card border border-dashed border-line-strong p-4">
          <p className="text-sm text-fg-muted">
            Пока нет ни одного готового ответа — помощник отвечает сам.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              icon={<Plus size={16} />}
              onClick={() => setEditing({ id: null, draft: EMPTY })}
            >
              Добавить ответ
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setEditing({ id: null, draft: EXAMPLE })}
            >
              Добавить пример
            </Button>
          </div>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2" aria-label="Готовые ответы">
            {list.map((a) => (
              <li
                key={a.id}
                className={cn(
                  'flex flex-col gap-1.5 rounded-card border p-3',
                  a.enabled ? 'border-line' : 'border-dashed border-line-strong',
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-heading">
                      {a.title}
                      {!a.enabled && (
                        <span className="text-xs font-normal text-fg-muted"> · выключен</span>
                      )}
                    </p>
                    <p className="text-xs text-fg-muted">
                      Показан {a.shown} {plural(a.shown, 'раз', 'раза', 'раз')} · «Не помогло» —{' '}
                      {a.notHelped}
                    </p>
                  </div>
                  <IconButton
                    size="sm"
                    label={`Изменить: ${a.title}`}
                    icon={<Pencil size={16} />}
                    onClick={() => setEditing({ id: a.id, draft: toDraft(a) })}
                  />
                  <IconButton
                    size="sm"
                    label={`Удалить: ${a.title}`}
                    icon={<Trash2 size={16} />}
                    onClick={() => setRemoving(a)}
                  />
                </div>
                <ul className="flex flex-wrap gap-1" aria-label="Ключевые слова">
                  {a.keywords.map((k) => (
                    <li key={k} className="rounded-full bg-sunken px-2 py-0.5 text-xs text-fg">
                      {k}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <div>
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus size={16} />}
              disabled={!!limits && list.length >= limits.answers}
              onClick={() => setEditing({ id: null, draft: EMPTY })}
            >
              Добавить ответ
            </Button>
          </div>
        </>
      )}

      <Editor
        state={editing}
        limits={limits}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />
      <Dialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Удалить готовый ответ?"
        description={removing ? `«${removing.title}» больше не будет показываться.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Отмена
            </Button>
            <Button
              data-autofocus
              onClick={() => {
                const id = removing?.id;
                setRemoving(null);
                if (id)
                  void answersApi
                    .remove(id)
                    .then(load)
                    .catch((e: Error) => setError(e.message));
              }}
            >
              Удалить
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </Block>
  );
}

const toDraft = (a: CannedAnswer): CannedDraft => ({
  title: a.title,
  keywords: a.keywords,
  when: a.when,
  body: a.body,
  links: a.links,
  enabled: a.enabled,
});

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** «Проверить»: что увидит человек на эту фразу и почему. */
function TestBox({ disabled }: { disabled: boolean }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<CannedTest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const run = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setRes(await answersApi.test(text.trim()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2 rounded-card bg-sunken p-3">
      <label htmlFor={id} className="text-sm font-medium text-heading">
        Проверить на фразе
      </label>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <input
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Например: как записаться к врачу?"
          disabled={disabled}
          className={cn(fieldClass, 'h-10 min-w-0 flex-1 bg-surface')}
        />
        <Button
          type="submit"
          size="sm"
          icon={<Search size={16} />}
          disabled={disabled || busy || !text.trim()}
        >
          {busy ? 'Проверяю…' : 'Проверить'}
        </Button>
      </form>
      <div aria-live="polite" className="text-sm">
        {error && <p className="font-medium text-heading">{error}</p>}
        {res &&
          (res.chosen ? (
            <p>
              <span className="font-medium text-heading">Покажу «{res.chosen.title}».</span>{' '}
              <span className="text-fg-muted">
                {res.source === 'ai' ? 'ИИ: ' : ''}
                {res.reason}
              </span>
            </p>
          ) : (
            <p>
              <span className="font-medium text-heading">
                Готовый ответ не покажу — ответит помощник.
              </span>{' '}
              <span className="text-fg-muted">
                {res.candidates.length
                  ? `По словам подходили: ${res.candidates.map((c) => `«${c.title}»`).join(', ')}. ${res.source === 'ai' ? 'ИИ: ' : ''}${res.reason}`
                  : 'Ни одно ключевое слово не нашлось.'}
              </span>
            </p>
          ))}
        {disabled && <p className="text-fg-muted">Добавьте хотя бы один ответ, чтобы проверять.</p>}
      </div>
    </div>
  );
}

function Editor({
  state,
  limits,
  onClose,
  onSaved,
}: {
  state: { id: string | null; draft: CannedDraft } | null;
  limits: CannedLimits | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState<CannedDraft>(EMPTY);
  const [keywords, setKeywords] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = { title: useId(), kw: useId(), when: useId(), body: useId(), en: useId() };

  useEffect(() => {
    if (!state) return;
    setD(state.draft);
    setKeywords(state.draft.keywords.join('\n'));
    setError(null);
  }, [state]);

  const set = (p: Partial<CannedDraft>) => setD((x) => ({ ...x, ...p }));
  const setLink = (i: number, p: Partial<CannedDraft['links'][number]>) =>
    set({ links: d.links.map((l, j) => (j === i ? { ...l, ...p } : l)) });

  const save = async () => {
    setBusy(true);
    setError(null);
    const draft: CannedDraft = {
      ...d,
      keywords: keywords
        .split(/[\n,;]/)
        .map((k) => k.trim())
        .filter(Boolean),
    };
    try {
      if (state?.id) await answersApi.update(state.id, draft);
      else await answersApi.create(draft);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!state}
      onClose={onClose}
      title={state?.id ? 'Изменить готовый ответ' : 'Новый готовый ответ'}
      description="Помощник покажет текст дословно — только если обращение подходит по смыслу."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? 'Сохраняю…' : 'Сохранить'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field
          id={ids.title}
          label="Название"
          hint="Видно в чате: «Ответ организации · Запись на приём»."
        >
          <input
            id={ids.title}
            data-autofocus
            value={d.title}
            maxLength={limits?.title}
            onChange={(e) => set({ title: e.target.value })}
            className={cn(fieldClass, 'h-11')}
          />
        </Field>
        <Field
          id={ids.kw}
          label="Ключевые слова и фразы"
          hint="Каждая — с новой строки. Слова ищутся в любой форме: «записаться» найдёт и «запись»."
        >
          <textarea
            id={ids.kw}
            rows={3}
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            className={cn(fieldClass, 'resize-y py-2 leading-snug')}
          />
        </Field>
        <Field
          id={ids.when}
          label="Когда подходит и когда нет"
          hint="Для ИИ: по этим словам он решает, показать ответ или ответить сам."
        >
          <textarea
            id={ids.when}
            rows={2}
            maxLength={limits?.when}
            value={d.when}
            onChange={(e) => set({ when: e.target.value })}
            placeholder="Подходит, если спрашивают, как… Не подходит, если…"
            className={cn(fieldClass, 'resize-y py-2 leading-snug')}
          />
        </Field>
        <Field
          id={ids.body}
          label="Текст ответа"
          hint="Шаги — нумерованным списком (1. 2. 3.), ссылка — [текст](https://адрес), жирный — **текст**."
        >
          <textarea
            id={ids.body}
            rows={7}
            maxLength={limits?.body}
            value={d.body}
            onChange={(e) => set({ body: e.target.value })}
            className={cn(fieldClass, 'resize-y py-2 font-mono text-sm leading-snug')}
          />
        </Field>
        {d.body.trim() && (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-fg-muted">Так увидит человек</p>
            <div className="rounded-card border border-line-strong bg-surface px-4 py-3">
              <Markdown text={d.body} />
            </div>
          </div>
        )}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-heading">Кнопки-ссылки</legend>
          {d.links.map((l, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                aria-label={`Подпись кнопки ${i + 1}`}
                value={l.label}
                maxLength={limits?.linkLabel}
                onChange={(e) => setLink(i, { label: e.target.value })}
                placeholder="Перейти в раздел"
                className={cn(fieldClass, 'h-10 min-w-0 flex-1 basis-40')}
              />
              <input
                aria-label={`Адрес кнопки ${i + 1}`}
                value={l.url}
                inputMode="url"
                maxLength={limits?.url}
                onChange={(e) => setLink(i, { url: e.target.value })}
                placeholder="https://…"
                className={cn(fieldClass, 'h-10 min-w-0 flex-[2] basis-56')}
              />
              <IconButton
                size="sm"
                label={`Убрать кнопку ${i + 1}`}
                icon={<X size={16} />}
                onClick={() => set({ links: d.links.filter((_, j) => j !== i) })}
              />
            </div>
          ))}
          <div>
            <Button
              size="sm"
              variant="ghost"
              icon={<Plus size={16} />}
              disabled={d.links.length >= (limits?.links ?? 5)}
              onClick={() => set({ links: [...d.links, { label: '', url: '' }] })}
            >
              Добавить кнопку
            </Button>
          </div>
        </fieldset>
        <label htmlFor={ids.en} className="flex min-h-11 items-center gap-3 text-sm">
          <input
            id={ids.en}
            type="checkbox"
            checked={d.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
            className="size-4 accent-primary"
          />
          Включён — помощник может показывать этот ответ
        </label>
        {error && (
          <p role="alert" className="text-sm font-medium text-heading">
            {error}
          </p>
        )}
      </div>
    </Dialog>
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
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-heading">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-fg-muted">{hint}</p>}
    </div>
  );
}
