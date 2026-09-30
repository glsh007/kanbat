import { useOrgChanged } from '@/features/org/orgEvents';
import type { AnswerSample, SampleDraft, SampleLimits } from '@app/shared';
import { Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { fieldClass } from '@/components/ui/Field';
import { IconButton } from '@/components/ui/IconButton';
import { Markdown } from '@/features/task/Markdown';
import { samplesApi } from '@/lib/api';
import { cn } from '@/lib/cn';

/** Пример для пустого списка — видно, чему учит образец: тон, построение, что сказать в конце. */
const EXAMPLE: SampleDraft = {
  question: 'Не могу войти в личный кабинет',
  answer:
    'Давайте разберёмся — обычно хватает пары минут.\n\n1. Проверьте раскладку и Caps Lock — пароль чувствителен к регистру.\n2. Нажмите «Забыли пароль?» на странице входа — ссылка придёт на почту.\n3. Письма нет — загляните в «Спам».\n\nЕсли не получится, напишите, на каком шаге застряли.',
  enabled: true,
};

const EMPTY: SampleDraft = { question: '', answer: '', enabled: true };

/**
 * «Образцы ответов» (ТЗ v4.27, п. 17, шаг 3): пара «вопрос → хороший ответ». Учит помощника, как здесь
 * принято отвечать; человек образец не видит — помощник пишет свой ответ по 1–2 самым похожим образцам.
 */
export function AnswerSamples({
  Block,
}: {
  Block: (p: { title: string; hint?: string; children: ReactNode }) => ReactNode;
}) {
  const [list, setList] = useState<AnswerSample[] | null>(null);
  const [limits, setLimits] = useState<SampleLimits | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; draft: SampleDraft } | null>(null);
  const [removing, setRemoving] = useState<AnswerSample | null>(null);

  const load = useCallback(
    () =>
      samplesApi
        .list()
        .then((r) => {
          setList(r.samples);
          setLimits(r.limits);
        })
        .catch((e: Error) => setError(e.message)),
    [],
  );
  useOrgChanged(load);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Block
      title="Образцы ответов"
      hint="Образец учит помощника, как у вас принято отвечать: тон, длина, что обязательно сказать. В отличие от готового ответа, человек его не видит — помощник пишет свой ответ, опираясь на 1–2 самых похожих образца."
    >
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
            Пока нет ни одного образца — помощник отвечает в своём стиле.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              icon={<Plus size={16} />}
              onClick={() => setEditing({ id: null, draft: EMPTY })}
            >
              Добавить образец
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
          <ul className="flex flex-col gap-2" aria-label="Образцы ответов">
            {list.map((s) => (
              <li
                key={s.id}
                className={cn(
                  'flex flex-col gap-1.5 rounded-card border p-3',
                  s.enabled ? 'border-line' : 'border-dashed border-line-strong',
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-heading">
                      «{s.question}»
                      {!s.enabled && (
                        <span className="text-xs font-normal text-fg-muted"> · выключен</span>
                      )}
                    </p>
                    <p className="line-clamp-2 text-sm text-fg-muted">{plain(s.answer)}</p>
                  </div>
                  <IconButton
                    size="sm"
                    label={`Изменить образец: ${s.question}`}
                    icon={<Pencil size={16} />}
                    onClick={() =>
                      setEditing({
                        id: s.id,
                        draft: { question: s.question, answer: s.answer, enabled: s.enabled },
                      })
                    }
                  />
                  <IconButton
                    size="sm"
                    label={`Удалить образец: ${s.question}`}
                    icon={<Trash2 size={16} />}
                    onClick={() => setRemoving(s)}
                  />
                </div>
                {!!s.conflicts?.length && <Conflicts list={s.conflicts} />}
              </li>
            ))}
          </ul>
          <div>
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus size={16} />}
              disabled={!!limits && list.length >= limits.samples}
              onClick={() => setEditing({ id: null, draft: EMPTY })}
            >
              Добавить образец
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
        title="Удалить образец?"
        description={
          removing ? `«${removing.question}» больше не будет подсказывать помощнику.` : undefined
        }
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
                  void samplesApi
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

/** Первые строки ответа без Markdown — для списка. */
const plain = (s: string) =>
  s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*_`>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function Conflicts({ list }: { list: string[] }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-heading">
      <TriangleAlert size={14} aria-hidden className="mt-0.5 shrink-0" />
      <span>
        Есть запрещённая фраза ({list.map((f) => `«${f}»`).join(', ')}) — помощник её всё равно не
        покажет: предложение уберёт фильтр «Жёстких правил». Лучше переписать образец.
      </span>
    </p>
  );
}

function Editor({
  state,
  limits,
  onClose,
  onSaved,
}: {
  state: { id: string | null; draft: SampleDraft } | null;
  limits: SampleLimits | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState<SampleDraft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = { q: useId(), a: useId(), en: useId() };

  useEffect(() => {
    if (!state) return;
    setD(state.draft);
    setError(null);
  }, [state]);

  const set = (p: Partial<SampleDraft>) => setD((x) => ({ ...x, ...p }));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (state?.id) await samplesApi.update(state.id, d);
      else await samplesApi.create(d);
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
      title={state?.id ? 'Изменить образец' : 'Новый образец ответа'}
      description="Человек образец не видит: помощник берёт из него тон, построение и обязательные сведения."
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
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.q} className="text-sm font-medium text-heading">
            Вопрос
          </label>
          <input
            id={ids.q}
            data-autofocus
            value={d.question}
            maxLength={limits?.question}
            onChange={(e) => set({ question: e.target.value })}
            placeholder="Как обычно спрашивают: «Не могу войти в личный кабинет»"
            className={cn(fieldClass, 'h-11')}
          />
          <p className="text-xs text-fg-muted">
            По словам вопроса помощник поймёт, к каким обращениям образец подходит.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.a} className="text-sm font-medium text-heading">
            Хороший ответ
          </label>
          <textarea
            id={ids.a}
            rows={7}
            maxLength={limits?.answer}
            value={d.answer}
            onChange={(e) => set({ answer: e.target.value })}
            className={cn(fieldClass, 'resize-y py-2 font-mono text-sm leading-snug')}
          />
          <p className="text-xs text-fg-muted">
            Так, как ответил бы лучший сотрудник. Шаги — списком (1. 2. 3.), ссылка —
            [текст](https://адрес).
          </p>
        </div>
        {d.answer.trim() && (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-fg-muted">Как выглядит образец</p>
            <div className="rounded-card border border-line-strong bg-surface px-4 py-3">
              <Markdown text={d.answer} />
            </div>
          </div>
        )}
        <label htmlFor={ids.en} className="flex min-h-11 items-center gap-3 text-sm">
          <input
            id={ids.en}
            type="checkbox"
            checked={d.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
            className="size-4 accent-primary"
          />
          Включён — помощник учитывает этот образец
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
