import {
  RULE_ACTION_LABELS,
  type ChecksView,
  type ErrorReview,
  type RuleAction,
} from '@app/shared';
import { BookOpenCheck, ClipboardCheck, Gavel, X } from 'lucide-react';
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { fieldClass } from '@/components/ui/Field';
import { Markdown } from '@/features/task/Markdown';
import { checksApi, reviewsApi, rulesApi, samplesApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { orgChanged, useOrgChanged } from './orgEvents';

/** Пункт разбора: прислан человеком или отмечен «Плохо» в прогоне. */
interface Item {
  key: string;
  source: 'user' | 'check';
  id: string;
  question: string;
  answer: string;
  note: string;
  label: string;
  at: string;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * «Разбор ошибок» (ТЗ v4.29, п. 17, шаг 4): ответы, которые не помогли (человек показал сам) или
 * получили «Плохо» в прогоне, — одной кнопкой в проверочный вопрос, образец или правило.
 */
export function ErrorReviews({
  Block,
}: {
  Block: (p: { title: string; hint?: string; children: ReactNode }) => ReactNode;
}) {
  const [reviews, setReviews] = useState<ErrorReview[] | null>(null);
  const [checks, setChecks] = useState<ChecksView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [sample, setSample] = useState<Item | null>(null);
  const [rule, setRule] = useState<Item | null>(null);

  const load = useCallback(() => {
    void reviewsApi
      .list()
      .then((r) => setReviews(r.reviews))
      .catch((e: Error) => setError(e.message));
    void checksApi
      .get()
      .then(setChecks)
      .catch(() => {});
  }, []);
  useEffect(load, [load]);
  useOrgChanged(load);

  const items: Item[] = [
    ...(reviews ?? [])
      .filter((r) => r.status === 'new')
      .map((r): Item => ({
        key: 'r' + r.id,
        source: 'user',
        id: r.id,
        question: r.question,
        answer: r.answer,
        note: r.note,
        label: r.reason === 'rework' ? 'Пользователь: «Доработать»' : 'Пользователь: «Не помогло»',
        at: r.createdAt,
      })),
    ...Object.values(checks?.results ?? {})
      .filter((r) => r.mark === 'bad' && !r.error)
      .map((r): Item => ({
        key: 'c' + r.questionId,
        source: 'check',
        id: r.questionId,
        question: r.text,
        answer: r.reply,
        note: '',
        label: 'Прогон: вы отметили «Плохо»',
        at: r.at,
      })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const done = (reviews ?? []).filter((r) => r.status === 'done').length;

  /** Пункт разобран: у присланного — итог, у прогона — снимаем «Плохо». */
  const finish = async (it: Item, outcome: ErrorReview['outcome'], text: string) => {
    if (it.source === 'user') await reviewsApi.resolve(it.id, outcome);
    else await checksApi.mark(it.id, null);
    setNote(text);
    orgChanged();
  };

  const act = (fn: () => Promise<void>) => {
    setError(null);
    setNote(null);
    fn().catch((e: Error) => setError(e.message));
  };

  return (
    <Block
      title="Разбор ошибок"
      hint="Ответы, которые не помогли: их показали сами пользователи (кнопкой после «Не помогло» или «Доработать») или вы отметили «Плохо» в прогоне. Превратите ответ в проверочный вопрос, образец или правило — помощник больше так не ошибётся."
    >
      {error && (
        <p role="alert" className="text-sm font-medium text-heading">
          {error}
        </p>
      )}
      <p className="text-sm text-fg-muted" aria-live="polite">
        {note ??
          (reviews === null
            ? 'Загрузка…'
            : items.length
              ? `Ждут разбора: ${items.length}${done ? ` · разобрано: ${done}` : ''}`
              : `Разбирать пока нечего${done ? ` · разобрано: ${done}` : ''}.`)}
      </p>
      {items.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Ответы на разбор">
          {items.map((it) => (
            <li key={it.key} className="flex flex-col gap-2 rounded-card border border-line p-3">
              <p className="text-xs text-fg-muted">
                {it.label} · {fmt(it.at)}
              </p>
              <p className="font-medium text-heading">«{it.question}»</p>
              {it.note && it.note !== 'Не помогло' && (
                <p className="text-sm">
                  <span className="text-fg-muted">Пользователь написал: </span>«{it.note}»
                </p>
              )}
              <details className="rounded-control bg-sunken">
                <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm text-heading">
                  Ответ помощника
                </summary>
                <div className="px-3 pb-3">
                  <div className="rounded-card border border-line bg-surface px-3 py-2">
                    <Markdown text={it.answer || '—'} />
                  </div>
                </div>
              </details>
              <div className="flex flex-wrap gap-2">
                {it.source === 'user' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<ClipboardCheck size={16} />}
                    onClick={() =>
                      act(async () => {
                        await checksApi.create({
                          text: it.question.slice(0, 500),
                          expect: {
                            route: 'any',
                            cannedId: '',
                            has: [],
                            hasNot: [],
                            urgent: 'any',
                            service: '',
                          },
                        });
                        await finish(
                          it,
                          'check',
                          'Добавлено в «Проверочные вопросы» — укажите там, что должно получиться.',
                        );
                      })
                    }
                  >
                    В проверочные вопросы
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<BookOpenCheck size={16} />}
                  onClick={() => setSample(it)}
                >
                  Написать образец
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Gavel size={16} />}
                  onClick={() => setRule(it)}
                >
                  Добавить правило
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<X size={16} />}
                  onClick={() => act(() => finish(it, 'closed', 'Закрыто без изменений.'))}
                >
                  Закрыть
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <SampleDialog
        item={sample}
        onClose={() => setSample(null)}
        onSaved={async (it) => {
          setSample(null);
          act(() => finish(it, 'sample', 'Образец добавлен в «Образцы ответов».'));
        }}
      />
      <RuleDialog
        item={rule}
        onClose={() => setRule(null)}
        onSaved={async (it) => {
          setRule(null);
          act(() => finish(it, 'rule', 'Правило добавлено в «Жёсткие правила».'));
        }}
      />
    </Block>
  );
}

/** Образец из неудачного ответа: вопрос тот же, ответ — переписать, как надо было. */
function SampleDialog({
  item,
  onClose,
  onSaved,
}: {
  item: Item | null;
  onClose: () => void;
  onSaved: (it: Item) => void;
}) {
  const [q, setQ] = useState('');
  const [a, setA] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = { q: useId(), a: useId() };
  useEffect(() => {
    if (!item) return;
    setQ(item.question.slice(0, 300));
    setA(item.answer.slice(0, 2000));
    setError(null);
  }, [item]);
  return (
    <Dialog
      open={!!item}
      onClose={onClose}
      title="Образец из этого ответа"
      description="Перепишите ответ так, как помощник должен был ответить. Человек образец не увидит — по нему помощник будет отвечать на похожие вопросы."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              if (!item) return;
              setBusy(true);
              setError(null);
              samplesApi
                .create({ question: q, answer: a, enabled: true })
                .then(() => onSaved(item))
                .catch((e: Error) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? 'Сохраняю…' : 'Сохранить образец'}
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
            value={q}
            maxLength={300}
            onChange={(e) => setQ(e.target.value)}
            className={cn(fieldClass, 'h-11')}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.a} className="text-sm font-medium text-heading">
            Хороший ответ
          </label>
          <textarea
            id={ids.a}
            data-autofocus
            rows={8}
            maxLength={2000}
            value={a}
            onChange={(e) => setA(e.target.value)}
            className={cn(fieldClass, 'resize-y py-2 font-mono text-sm leading-snug')}
          />
          <p className="text-xs text-fg-muted">Сейчас здесь неудачный ответ — перепишите его.</p>
        </div>
        {error && (
          <p role="alert" className="text-sm font-medium text-heading">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

const ACTIONS: RuleAction[] = ['specialist', 'urgent', 'hard', 'service'];

/** Правило из неудачного ответа: фразы из вопроса → действие; добавляется к «Жёстким правилам». */
function RuleDialog({
  item,
  onClose,
  onSaved,
}: {
  item: Item | null;
  onClose: () => void;
  onSaved: (it: Item) => void;
}) {
  const [phrases, setPhrases] = useState('');
  const [action, setAction] = useState<RuleAction>('specialist');
  const [extra, setExtra] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = { p: useId(), a: useId(), e: useId() };
  useEffect(() => {
    if (!item) return;
    setPhrases(item.question.replace(/\s+/g, ' ').slice(0, 80).trim());
    setAction('specialist');
    setExtra('');
    setError(null);
  }, [item]);
  return (
    <Dialog
      open={!!item}
      onClose={onClose}
      title="Правило из этого ответа"
      description="Оставьте в фразах главные слова обращения — правило сработает на все обращения, где они есть."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              if (!item) return;
              setBusy(true);
              setError(null);
              rulesApi
                .get()
                .then((cur) =>
                  rulesApi.save({
                    forbidden: cur.forbidden,
                    rules: [
                      ...cur.rules,
                      {
                        id: 'r' + Date.now().toString(36),
                        phrases: phrases
                          .split('\n')
                          .map((x) => x.trim())
                          .filter(Boolean),
                        action,
                        service: action === 'service' ? extra.trim() : '',
                        note: action === 'specialist' ? extra.trim() : '',
                        enabled: true,
                      },
                    ],
                  }),
                )
                .then(() => onSaved(item))
                .catch((e: Error) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? 'Сохраняю…' : 'Добавить правило'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.p} className="text-sm font-medium text-heading">
            Фразы в обращении
          </label>
          <textarea
            id={ids.p}
            data-autofocus
            rows={3}
            value={phrases}
            onChange={(e) => setPhrases(e.target.value)}
            className={cn(fieldClass, 'resize-y py-2 leading-snug')}
          />
          <p className="text-xs text-fg-muted">
            Каждая — с новой строки. Срабатывает, если в обращении есть все слова фразы.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.a} className="text-sm font-medium text-heading">
            Что сделать
          </label>
          <select
            id={ids.a}
            value={action}
            onChange={(e) => setAction(e.target.value as RuleAction)}
            className={cn(fieldClass, 'h-11')}
          >
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {RULE_ACTION_LABELS[a]}
              </option>
            ))}
          </select>
        </div>
        {(action === 'specialist' || action === 'service') && (
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.e} className="text-sm font-medium text-heading">
              {action === 'service' ? 'Сервис' : 'Что сказать человеку (необязательно)'}
            </label>
            <input
              id={ids.e}
              value={extra}
              maxLength={action === 'service' ? 60 : 300}
              onChange={(e) => setExtra(e.target.value)}
              className={cn(fieldClass, 'h-11')}
            />
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm font-medium text-heading">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
