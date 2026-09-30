import { useOrgChanged } from '@/features/org/orgEvents';
import type {
  CannedAnswer,
  CheckDraft,
  CheckExpect,
  CheckQuestion,
  CheckResult,
  CheckStatus,
  ChecksView,
  ExpectRoute,
} from '@app/shared';
import {
  Check,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  CircleX,
  Download,
  Pencil,
  Play,
  Plus,
  Square,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { fieldClass } from '@/components/ui/Field';
import { IconButton } from '@/components/ui/IconButton';
import { Markdown } from '@/features/task/Markdown';
import { answersApi, checksApi } from '@/lib/api';
import { cn } from '@/lib/cn';

const ROUTE_OPTIONS: [ExpectRoute, string][] = [
  ['any', 'Не важно'],
  ['answer', 'Ответит сам'],
  ['canned', 'Покажет готовый ответ'],
  ['specialist', 'Предложит специалиста'],
  ['clarify', 'Задаст уточняющие вопросы'],
  ['describe', 'Поддержит разговор — обращения нет'],
];

const EMPTY: CheckDraft = {
  text: '',
  expect: { route: 'any', cannedId: '', has: [], hasNot: [], urgent: 'any', service: '' },
};

const STATUS: Record<CheckStatus, { label: string; icon: ReactNode }> = {
  pass: { label: 'Пройден', icon: <CircleCheck size={16} aria-hidden /> },
  fail: { label: 'Не пройден', icon: <CircleX size={16} aria-hidden /> },
  error: { label: 'Ошибка', icon: <CircleAlert size={16} aria-hidden /> },
  unchecked: { label: 'Оцените сами', icon: <CircleHelp size={16} aria-hidden /> },
};

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

function duration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s} с`;
  const m = Math.round(s / 60);
  return `${m} мин`;
}

/**
 * «Проверочные вопросы» (ТЗ v4.27, п. 17, шаг 3): типичные обращения с ожиданиями. «Прогнать» проверяет
 * их на настоящей модели тем же путём, что живое обращение, и показывает, где помощник ответил не так.
 */
export function CheckQuestions({
  Block,
}: {
  Block: (p: { title: string; hint?: string; children: ReactNode }) => ReactNode;
}) {
  const [view, setView] = useState<ChecksView | null>(null);
  const [canned, setCanned] = useState<CannedAnswer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; draft: CheckDraft } | null>(null);
  const [removing, setRemoving] = useState<CheckQuestion | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      checksApi
        .get()
        .then((v) => {
          setView(v);
          setError(null);
        })
        .catch((e: Error) => setError(e.message)),
    [],
  );
  useEffect(() => {
    void load();
    void answersApi
      .list()
      .then((r) => setCanned(r.answers))
      .catch(() => {});
  }, [load]);

  useOrgChanged(load);
  const running = view?.run?.status === 'running';
  // пока идёт прогон — обновляем раз в 1,5 с (прогон идёт на сервере: со страницы можно уйти)
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => void load(), 1500);
    return () => clearInterval(t);
  }, [running, load]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const questions = view?.questions ?? [];
  const results = view?.results ?? {};
  const noAi = view?.provider === 'mock';

  return (
    <Block
      title="Проверочные вопросы"
      hint="Типичные обращения и что должно получиться. «Прогнать» проверяет их на настоящей модели — тем же путём, что живое обращение, — и показывает, где помощник ответил не так. Удобно после любой правки: профиля, правил, готовых ответов, образцов или смены модели. На доску ничего не попадает."
    >
      {!view ? (
        <p className="text-sm text-fg-muted">{error ?? 'Загрузка…'}</p>
      ) : (
        <>
          {questions.length === 0 ? (
            <div className="flex flex-col items-start gap-2 rounded-card border border-dashed border-line-strong p-4">
              <p className="text-sm text-fg-muted">Пока нет ни одного проверочного вопроса.</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  icon={<Plus size={16} />}
                  onClick={() => setEditing({ id: null, draft: EMPTY })}
                >
                  Добавить вопрос
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void act(() => checksApi.examples())}
                >
                  Добавить примеры
                </Button>
              </div>
              <p className="text-xs text-fg-muted">
                Примеры — 5 вопросов под шаблон отрасли из профиля организации.
              </p>
            </div>
          ) : (
            <RunPanel
              view={view}
              busy={busy}
              noAi={noAi}
              onRun={() => void act(() => checksApi.run(null))}
              onStop={() => void act(() => checksApi.stop())}
            />
          )}

          {error && (
            <p role="alert" className="text-sm font-medium text-heading">
              {error}
            </p>
          )}

          {questions.length > 0 && (
            <>
              <ol className="flex flex-col gap-2" aria-label="Проверочные вопросы">
                {questions.map((q) => (
                  <QuestionCard
                    key={q.id}
                    q={q}
                    result={results[q.id]}
                    state={
                      running && view.run?.ids.includes(q.id)
                        ? view.run.ids.indexOf(q.id) === view.run.done
                          ? 'now'
                          : view.run.ids.indexOf(q.id) > view.run.done
                            ? 'queued'
                            : null
                        : null
                    }
                    canned={canned}
                    routes={view.routes}
                    locked={running || busy}
                    noAi={noAi}
                    onRun={() => void act(() => checksApi.run([q.id]))}
                    onEdit={() =>
                      setEditing({ id: q.id, draft: { text: q.text, expect: q.expect } })
                    }
                    onRemove={() => setRemoving(q)}
                    onMark={(m) => void act(() => checksApi.mark(q.id, m))}
                  />
                ))}
              </ol>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Plus size={16} />}
                  disabled={questions.length >= view.limits.questions}
                  onClick={() => setEditing({ id: null, draft: EMPTY })}
                >
                  Добавить вопрос
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || questions.length >= view.limits.questions}
                  onClick={() => void act(() => checksApi.examples())}
                >
                  Добавить примеры
                </Button>
              </div>
            </>
          )}

          <Editor
            state={editing}
            canned={canned}
            limits={view.limits}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              void load();
            }}
          />
          <Dialog
            open={!!removing}
            onClose={() => setRemoving(null)}
            title="Удалить проверочный вопрос?"
            description={
              removing ? `«${removing.text}» и его последний результат будут удалены.` : undefined
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
                    if (id) void act(() => checksApi.remove(id));
                  }}
                >
                  Удалить
                </Button>
              </>
            }
          >
            {null}
          </Dialog>
        </>
      )}
    </Block>
  );
}

/** Прогон: итог последнего, ход текущего, «Прогнать все» / «Остановить», чего это стоит. */
function RunPanel({
  view,
  busy,
  noAi,
  onRun,
  onStop,
}: {
  view: ChecksView;
  busy: boolean;
  noAi: boolean;
  onRun: () => void;
  onStop: () => void;
}) {
  const run = view.run;
  const n = view.questions.length;
  const results = view.questions.map((q) => view.results[q.id]).filter(Boolean) as CheckResult[];
  const count = (s: CheckStatus) => results.filter((r) => r.status === s).length;
  const running = run?.status === 'running';

  let eta = '';
  if (running && run) {
    const spent = Date.now() - new Date(run.startedAt).getTime();
    eta =
      run.done > 0
        ? `осталось ~${duration((spent / run.done) * (run.total - run.done))}`
        : 'первый ответ — обычно 15–40 с';
  }

  return (
    <div className="flex flex-col gap-2 rounded-card bg-sunken p-3">
      {running && run ? (
        <>
          <p className="text-sm font-medium text-heading" aria-live="polite">
            Идёт прогон: {run.done} из {run.total} · {eta}
          </p>
          <div
            role="progressbar"
            aria-label="Ход прогона"
            aria-valuemin={0}
            aria-valuemax={run.total}
            aria-valuenow={run.done}
            className="h-2 overflow-hidden rounded-full bg-surface"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${(run.done / Math.max(1, run.total)) * 100}%` }}
            />
          </div>
          <p className="text-xs text-fg-muted">
            Прогон идёт на сервере — со страницы можно уйти. Пока он идёт, людям ответы могут
            приходить медленнее: модель отвечает по очереди.
          </p>
          <div>
            <Button
              size="sm"
              variant="secondary"
              icon={<Square size={14} />}
              disabled={busy}
              onClick={onStop}
            >
              Остановить
            </Button>
          </div>
        </>
      ) : (
        <>
          {run && (
            <p className="text-sm text-heading" aria-live="polite">
              {run.status === 'stopped'
                ? `Прогон остановлен: ${run.done} из ${run.total}${run.error ? ` — ${lower(run.error)}` : ''}.`
                : run.status === 'failed'
                  ? `Прогон прерван: ${run.error ?? 'ошибка'}.`
                  : `Последний прогон: ${fmtDate(run.startedAt)} · ${run.model ?? ''}${
                      run.finishedAt
                        ? ` · ${duration(new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime())}`
                        : ''
                    }`}
            </p>
          )}
          {results.length > 0 && (
            <p className="text-sm">
              <span className="font-medium text-heading">
                Пройдено {count('pass')} из {n}
              </span>
              <span className="text-fg-muted">
                {count('fail') ? ` · не пройдено ${count('fail')}` : ''}
                {count('error') ? ` · ошибок ${count('error')}` : ''}
                {count('unchecked') ? ` · оцените сами ${count('unchecked')}` : ''}
                {n - results.length ? ` · ещё не прогоняли ${n - results.length}` : ''}
              </span>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" icon={<Play size={16} />} disabled={busy || noAi} onClick={onRun}>
              Прогнать все ({n})
            </Button>
            {results.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                icon={<Download size={16} />}
                onClick={() => downloadReport(view)}
              >
                Скачать отчёт
              </Button>
            )}
          </div>
          <p className="text-xs text-fg-muted">
            {noAi
              ? 'ИИ сейчас недоступен — прогон проверяет настоящую модель.'
              : view.provider === 'openai'
                ? `Прогон расходует токены облачного ИИ вашего аккаунта: около ${n * 3} запросов к модели (2–4 на вопрос).`
                : `Около ${n * 3} запросов к модели (2–4 на вопрос); на своём компьютере — примерно 15–40 с на вопрос.`}
          </p>
        </>
      )}
    </div>
  );
}

const STATUS_TEXT: Record<CheckStatus, string> = {
  pass: 'пройден',
  fail: 'НЕ ПРОЙДЕН',
  error: 'ошибка',
  unchecked: 'оцените сами',
};

/**
 * Отчёт прогона одним файлом (Markdown): его удобно прислать разработчику, чтобы поправить
 * инструкции по ответам настоящей модели (ТЗ v4.29).
 */
function reportMarkdown(view: ChecksView, now = new Date()): string {
  const run = view.run;
  const res = view.questions.map((q) => ({ q, r: view.results[q.id] }));
  const count = (st: CheckStatus) => res.filter((x) => x.r?.status === st).length;
  const out: string[] = [
    `# Отчёт прогона проверочных вопросов`,
    '',
    `Скачан: ${now.toLocaleString('ru-RU')}${run ? ` · прогон: ${fmtDate(run.startedAt)} · модель: ${run.model ?? '—'}` : ''}`,
    '',
    `Пройдено ${count('pass')} из ${res.length} · не пройдено ${count('fail')} · ошибок ${count('error')} · оцените сами ${count('unchecked')}`,
    '',
  ];
  res.forEach(({ q, r }, i) => {
    out.push(`## ${i + 1}. «${q.text}»`, '');
    const chips = expectChips(q.expect, view.routes, []);
    out.push(`Ожидания: ${chips.length ? chips.join('; ') : 'нет'}`, '');
    if (!r) {
      out.push('Результата нет — вопрос ещё не прогоняли.', '');
      return;
    }
    out.push(
      `Итог: **${STATUS_TEXT[r.status]}**${r.prev && r.prev !== r.status ? ` (раньше: ${STATUS_TEXT[r.prev]})` : ''} · ${duration(r.ms)} · ${r.model ?? ''}${r.mark ? ` · ваша оценка: ${r.mark === 'good' ? 'хорошо' : 'плохо'}` : ''}`,
      '',
    );
    if (r.error) out.push(`Ошибка: ${r.error}`, '');
    for (const it of r.items)
      out.push(`- ${it.ok ? '[x]' : '[ ]'} ${it.label}${it.detail ? ` — ${it.detail}` : ''}`);
    if (r.items.length) out.push('');
    out.push(
      `Что сделал помощник: ${r.route === 'canned' && r.canned ? `готовый ответ «${r.canned.title}»` : r.route ? view.routes[r.route] : '—'}` +
        `${r.urgency ? ` · срочность: ${URGENCY[r.urgency] ?? r.urgency}` : ''}${r.service ? ` · сервис: ${r.service}` : ''}`,
    );
    if (r.samples.length) out.push(`Образцы: ${r.samples.map((x) => `«${x}»`).join(', ')}`);
    if (r.rules.length) out.push(`Правила: ${r.rules.map((x) => `«${x.phrase}»`).join(', ')}`);
    out.push('', 'Ответ:', '', ...(r.reply || '—').split('\n').map((l) => `> ${l}`), '');
  });
  return out.join('\n');
}

function downloadReport(view: ChecksView) {
  const blob = new Blob([reportMarkdown(view)], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kanbat-otchet-progona-${new Date().toISOString().slice(0, 10)}.md`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function expectChips(e: CheckExpect, routes: ChecksView['routes'], canned: CannedAnswer[]) {
  const out: string[] = [];
  if (e.route !== 'any') {
    const title =
      e.route === 'canned' && e.cannedId ? canned.find((a) => a.id === e.cannedId)?.title : null;
    out.push(`Помощник ${routes[e.route]}${title ? ` «${title}»` : ''}`);
  }
  for (const p of e.has) out.push(`есть «${p}»`);
  for (const p of e.hasNot) out.push(`нет «${p}»`);
  if (e.urgent !== 'any') out.push(e.urgent === 'yes' ? 'срочно' : 'не срочно');
  if (e.service) out.push(`сервис «${e.service}»`);
  return out;
}

function QuestionCard({
  q,
  result,
  state,
  canned,
  routes,
  locked,
  noAi,
  onRun,
  onEdit,
  onRemove,
  onMark,
}: {
  q: CheckQuestion;
  result: CheckResult | undefined;
  state: 'now' | 'queued' | null;
  canned: CannedAnswer[];
  routes: ChecksView['routes'];
  locked: boolean;
  noAi: boolean;
  onRun: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onMark: (m: 'good' | 'bad' | null) => void;
}) {
  const chips = expectChips(q.expect, routes, canned);
  const st = result ? STATUS[result.status] : null;
  const changed = result?.prev && result.prev !== result.status;
  const short = q.text.length > 60 ? q.text.slice(0, 59) + '…' : q.text;
  return (
    <li className="flex flex-col gap-2 rounded-card border border-line p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {state === 'now' ? (
              <span className="inline-flex items-center gap-1 font-medium text-heading">
                <CircleDashed
                  size={16}
                  aria-hidden
                  className="animate-spin motion-reduce:animate-none"
                />
                Проверяю…
              </span>
            ) : state === 'queued' ? (
              <span className="text-fg-muted">В очереди</span>
            ) : st ? (
              <span className="inline-flex items-center gap-1 font-medium text-heading">
                {st.icon}
                {st.label}
              </span>
            ) : (
              <span className="text-fg-muted">Ещё не прогоняли</span>
            )}
            {!state && changed && result?.prev && (
              <span className="rounded-full border border-line-strong px-2 py-0.5 text-xs text-heading">
                Раньше: {lower(STATUS[result.prev].label)}
              </span>
            )}
          </p>
          <p className="mt-1 font-medium text-heading">«{q.text}»</p>
          {chips.length > 0 ? (
            <ul className="mt-1 flex flex-wrap gap-1" aria-label="Ожидания">
              {chips.map((c) => (
                <li key={c} className="rounded-full bg-sunken px-2 py-0.5 text-xs text-fg">
                  {c}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-fg-muted">Без строгих проверок — оцените ответ сами.</p>
          )}
        </div>
        <IconButton
          size="sm"
          label={`Прогнать: ${short}`}
          icon={<Play size={16} />}
          disabled={locked || noAi}
          onClick={onRun}
        />
        <IconButton
          size="sm"
          label={`Изменить: ${short}`}
          icon={<Pencil size={16} />}
          disabled={locked}
          onClick={onEdit}
        />
        <IconButton
          size="sm"
          label={`Удалить: ${short}`}
          icon={<Trash2 size={16} />}
          disabled={locked}
          onClick={onRemove}
        />
      </div>

      {result && !state && (
        <div className="flex flex-col gap-2 border-t border-line pt-2">
          {result.error && <p className="text-sm text-heading">{result.error}</p>}
          {result.items.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-sm" aria-label="Проверки">
              {result.items.map((it, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  {it.ok ? (
                    <Check size={16} aria-hidden className="mt-0.5 shrink-0" />
                  ) : (
                    <X size={16} aria-hidden className="mt-0.5 shrink-0" />
                  )}
                  <span>
                    <span className="sr-only">{it.ok ? 'Да: ' : 'Нет: '}</span>
                    <span className={it.ok ? 'text-fg' : 'font-medium text-heading'}>
                      {it.label}
                    </span>
                    {it.detail && <span className="text-fg-muted"> — {it.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!result.error && (
            <details className="group rounded-control bg-sunken">
              <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm text-heading">
                {result.route === 'canned' && result.canned
                  ? `Готовый ответ «${result.canned.title}»`
                  : result.route
                    ? `Помощник ${routes[result.route]}`
                    : 'Ответ'}{' '}
                · {duration(result.ms)}
              </summary>
              <div className="flex flex-col gap-2 px-3 pb-3">
                <div className="rounded-card border border-line bg-surface px-3 py-2">
                  <Markdown text={result.reply || '—'} />
                </div>
                {result.samples.length > 0 && (
                  <p className="text-xs text-fg-muted">
                    Образцы: {result.samples.map((s) => `«${s}»`).join(', ')}
                  </p>
                )}
                {result.rules.length > 0 && (
                  <p className="text-xs text-fg-muted">
                    Правила: {result.rules.map((r) => `«${r.phrase}»`).join(', ')}
                  </p>
                )}
                <p className="text-xs text-fg-muted">
                  {fmtDate(result.at)} · {result.model}
                  {result.urgency
                    ? ` · срочность: ${URGENCY[result.urgency] ?? result.urgency}`
                    : ''}
                  {result.service ? ` · сервис: ${result.service}` : ''}
                </p>
              </div>
            </details>
          )}
          {!result.error && (
            <div
              className="flex flex-wrap items-center gap-2"
              role="group"
              aria-label="Ваша оценка ответа"
            >
              <span className="text-xs text-fg-muted max-sm:sr-only">Ваша оценка:</span>
              <Button
                size="sm"
                variant={result.mark === 'good' ? 'primary' : 'ghost'}
                aria-pressed={result.mark === 'good'}
                icon={<ThumbsUp size={14} />}
                disabled={locked}
                onClick={() => onMark(result.mark === 'good' ? null : 'good')}
              >
                Хорошо
              </Button>
              <Button
                size="sm"
                variant={result.mark === 'bad' ? 'primary' : 'ghost'}
                aria-pressed={result.mark === 'bad'}
                icon={<ThumbsDown size={14} />}
                disabled={locked}
                onClick={() => onMark(result.mark === 'bad' ? null : 'bad')}
              >
                Плохо
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

const URGENCY: Record<string, string> = {
  critical: 'срочно',
  high: 'высокая',
  normal: 'обычная',
  low: 'низкая',
};

const lines = (s: string) =>
  s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

function Editor({
  state,
  canned,
  limits,
  onClose,
  onSaved,
}: {
  state: { id: string | null; draft: CheckDraft } | null;
  canned: CannedAnswer[];
  limits: ChecksView['limits'];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState('');
  const [e, setE] = useState<CheckExpect>(EMPTY.expect);
  const [has, setHas] = useState('');
  const [hasNot, setHasNot] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = {
    text: useId(),
    route: useId(),
    canned: useId(),
    has: useId(),
    hasNot: useId(),
    urgent: useId(),
    service: useId(),
  };

  useEffect(() => {
    if (!state) return;
    setText(state.draft.text);
    setE(state.draft.expect);
    setHas(state.draft.expect.has.join('\n'));
    setHasNot(state.draft.expect.hasNot.join('\n'));
    setError(null);
  }, [state]);

  const set = (p: Partial<CheckExpect>) => setE((x) => ({ ...x, ...p }));

  const save = async () => {
    setBusy(true);
    setError(null);
    const draft: CheckDraft = { text, expect: { ...e, has: lines(has), hasNot: lines(hasNot) } };
    try {
      if (state?.id) await checksApi.update(state.id, draft);
      else await checksApi.create(draft);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!state}
      onClose={onClose}
      title={state?.id ? 'Изменить проверочный вопрос' : 'Новый проверочный вопрос'}
      description="Обращение — как его написал бы человек, и что должно получиться. Всё, кроме обращения, — по желанию."
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
          id={ids.text}
          label="Обращение"
          hint="Пишите со всеми деталями — прогон не отвечает на уточняющие вопросы."
        >
          <textarea
            id={ids.text}
            data-autofocus
            rows={2}
            maxLength={limits.text}
            value={text}
            onChange={(ev) => setText(ev.target.value)}
            placeholder="Не приходит почта в Outlook с утра, в браузере письма есть"
            className={cn(fieldClass, 'resize-y py-2 leading-snug')}
          />
        </Field>
        <Field id={ids.route} label="Что сделает помощник">
          <select
            id={ids.route}
            value={e.route}
            onChange={(ev) => set({ route: ev.target.value as ExpectRoute, cannedId: '' })}
            className={cn(fieldClass, 'h-11')}
          >
            {ROUTE_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        {e.route === 'canned' && (
          <Field id={ids.canned} label="Какой готовый ответ">
            <select
              id={ids.canned}
              value={e.cannedId}
              onChange={(ev) => set({ cannedId: ev.target.value })}
              className={cn(fieldClass, 'h-11')}
            >
              <option value="">Любой</option>
              {canned.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field
          id={ids.has}
          label="Должно быть в ответе"
          hint={`Каждая фраза — с новой строки, до ${limits.phrases}. Слово найдётся в любой форме («письмо» — «письма»), но однокоренное — нет («перезапуск» ≠ «перезапустите»).`}
        >
          <textarea
            id={ids.has}
            rows={2}
            value={has}
            onChange={(ev) => setHas(ev.target.value)}
            placeholder={'Outlook\nперезапустите'}
            className={cn(fieldClass, 'resize-y py-2 leading-snug')}
          />
        </Field>
        <Field id={ids.hasNot} label="Не должно быть в ответе">
          <textarea
            id={ids.hasNot}
            rows={2}
            value={hasNot}
            onChange={(ev) => setHasNot(ev.target.value)}
            placeholder={'передано специалисту\nгарантируем'}
            className={cn(fieldClass, 'resize-y py-2 leading-snug')}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id={ids.urgent} label="Срочность">
            <select
              id={ids.urgent}
              value={e.urgent}
              onChange={(ev) => set({ urgent: ev.target.value as CheckExpect['urgent'] })}
              className={cn(fieldClass, 'h-11')}
            >
              <option value="any">Не важно</option>
              <option value="yes">Срочно</option>
              <option value="no">Не срочно</option>
            </select>
          </Field>
          <Field id={ids.service} label="Сервис в разборе">
            <input
              id={ids.service}
              value={e.service}
              maxLength={limits.service}
              onChange={(ev) => set({ service: ev.target.value })}
              placeholder="Не важно"
              className={cn(fieldClass, 'h-11')}
            />
          </Field>
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
