import { PII_LABELS, type Message, type Task, type Triage } from '@app/shared';
import {
  AlertCircle,
  BookOpen,
  Check,
  Copy,
  Headset,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { CopyHandoff, HandoffSummary } from '@/features/support/HandoffSummary';
import { cn } from '@/lib/cn';
import type { LiveReply } from '@/features/board/store';
import { faqById } from '@/features/faq/faq';
import { SimilarThreads } from '@/features/forum/SimilarThreads';
import { Logo } from '@/brand/Logo';
import { Markdown } from './Markdown';

type Props = {
  task: Task;
  messages: Message[];
  live: LiveReply | undefined;
  busy: boolean;
  onApprovePlan: () => void;
  onRegenerate: () => void;
  onRetry: () => void;
  /** Без ИИ: выбран частый вопрос. */
  onFaq?: (topicId: string) => void;
  /** Передать специалисту (undefined — сейчас нельзя). */
  onEscalate?: () => void;
  /** ИИ долго думает: остановить ответ. */
  onStop?: () => void;
  /** ИИ долго думает: передать специалисту сразу, без сводки от ИИ. */
  onQuickEscalate?: () => void;
};

/** «Что произошло» — разбор обращения (ТЗ v2, п. 13.2). */
function TriageCard({ t }: { t: Triage }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-heading">Что произошло</h3>
      </div>
      <p>{t.summary}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-fg-muted">Сервис</dt>
        <dd>{t.service}</dd>
        {t.facts.length > 0 && (
          <>
            <dt className="text-fg-muted">Известно</dt>
            <dd>
              <ul className="list-disc pl-4">
                {t.facts.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </dd>
          </>
        )}
        <dt className="text-fg-muted">Дальше</dt>
        <dd>
          {t.missing.length
            ? `Уточню: ${t.missing
                .map((x) =>
                  x.replace(/^\s*(уточнить|уточню)[\s,:—-]*/i, '').replace(/[\s.;,]+$/, ''),
                )
                .join('; ')
                .toLowerCase()}`
            : t.mode === 'escalate'
              ? 'Передам специалисту'
              : t.mode === 'answer'
                ? 'Отвечу сразу'
                : t.mode === 'request'
                  ? 'Подскажу, как оформить'
                  : 'Данных достаточно — сразу к решению'}
        </dd>
      </dl>
    </div>
  );
}

/** Частые вопросы (без ИИ): самые похожие первыми, остальные — по «Показать все». */
function FaqChoices({ ids, onPick }: { ids: string[]; onPick: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? ids : ids.slice(0, 4);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-heading">Похожие частые вопросы</p>
      <ul className="flex flex-col gap-1.5">
        {shown.map((id) => {
          const t = faqById(id);
          if (!t) return null;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onPick(id)}
                className="flex w-full items-center gap-2 rounded-control border border-line bg-surface px-3 py-2.5 text-left text-[15px] transition-colors duration-200 hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <BookOpen size={16} aria-hidden className="shrink-0 text-fg-muted" />
                {t.title}
              </button>
            </li>
          );
        })}
      </ul>
      {!all && ids.length > 4 && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="self-start rounded-[6px] text-sm font-medium text-heading underline-offset-4 hover:underline"
        >
          Показать все ({ids.length})
        </button>
      )}
    </div>
  );
}

function ModelNote({ model, stopped }: { model?: string | null; stopped?: boolean }) {
  if (model === undefined && !stopped) return null;
  return (
    <span className="text-xs text-fg-muted">
      {model === null ? 'демо-режим' : model}
      {stopped && ' · остановлено'}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        })
      }
      className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2 text-xs text-fg-muted transition-colors duration-200 hover:bg-accent-soft hover:text-fg"
    >
      {done ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      {done ? 'Скопировано' : 'Копировать'}
    </button>
  );
}

/** «Думаю…»: летучая мышь качается на перекладине; у трудной задачи — ещё и «дышит». */
/** Через сколько секунд показывать время ожидания и подсказку «долго». */
const SHOW_TIMER_S = 8;
const SLOW_S = 25;

/**
 * «Помощник думает…» с честным временем ожидания. Если модель долго молчит (загружается,
 * занята другим запросом, работает на процессоре) — объясняем и даём выход: остановить
 * или сразу передать специалисту.
 */
function Typing({
  label,
  hard = false,
  onStop,
  onEscalate,
}: {
  label: string;
  hard?: boolean;
  onStop?: () => void;
  onEscalate?: () => void;
}) {
  const [since] = useState(() => Date.now());
  const [now, setNow] = useState(since);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const sec = Math.floor((now - since) / 1000);
  const slow = sec >= SLOW_S;
  return (
    <div className="flex flex-col gap-2" role="status">
      <div className="flex items-center gap-2.5 text-sm text-fg-muted">
        <Logo variant="mark" size={24} decorative animate={hard ? 'breathe' : 'swing'} />
        <span>{label}</span>
        {sec >= SHOW_TIMER_S && (
          <span className="tabular-nums" aria-hidden>
            · {sec} с
          </span>
        )}
      </div>
      {slow && (
        <div className="flex max-w-xl flex-col gap-2 rounded-card border border-line bg-surface px-3.5 py-3 text-sm">
          <p className="text-fg">
            Модель отвечает дольше обычного: она может загружаться, работать на процессоре или быть
            занятой другим запросом. Можно подождать{onStop || onEscalate ? ' — или:' : '.'}
          </p>
          {(onStop || onEscalate) && (
            <div className="flex flex-wrap gap-2">
              {onEscalate && (
                <Button size="sm" icon={<Headset size={16} />} onClick={onEscalate}>
                  Передать специалисту
                </Button>
              )}
              {onStop && (
                <Button size="sm" variant="secondary" icon={<X size={16} />} onClick={onStop}>
                  Остановить
                </Button>
              )}
            </div>
          )}
          <p className="text-xs text-fg-muted">
            Проверить скорость ИИ можно в «Настройках» (шестерёнка у вашего имени).
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Лента сообщений задачи. Контрольные точки (вопросы, план) — интерактивные блоки:
 * варианты ответа нажимаются, план подтверждается одной кнопкой.
 */
export function MessageList({
  task,
  messages,
  live,
  busy,
  onApprovePlan,
  onRegenerate,
  onRetry,
  onFaq,
  onEscalate,
  onStop,
  onQuickEscalate,
}: Props) {
  const lastFaq = [...messages].reverse().find((m) => m.kind === 'faq');
  const lastQuestions = [...messages].reverse().find((m) => m.kind === 'questions');
  const lastPlan = [...messages].reverse().find((m) => m.kind === 'plan');
  const lastSteps = [...messages].reverse().find((m) => m.kind === 'steps');
  const lastText = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && (m.kind ?? 'text') === 'text');
  const lastError =
    messages[messages.length - 1]?.kind === 'error' ? messages[messages.length - 1] : undefined;
  const currentQ =
    task.checkpoint === 'questions' && task.questions
      ? task.questions.length - task.pendingQuestions
      : -1;

  return (
    <ol className="flex flex-col gap-5" aria-label="Переписка">
      {messages.map((m) => {
        if (m.role === 'user')
          return (
            <li key={m.id} className="flex flex-col items-end gap-1">
              {m.answerTo && (
                <p className="max-w-[85%] text-right text-xs text-fg-muted">{m.answerTo}</p>
              )}
              <div className="max-w-[85%] rounded-[18px] rounded-br-[6px] bg-surface px-4 py-2.5 whitespace-pre-wrap text-fg ring-1 ring-line">
                <span className="sr-only">Вы: </span>
                {m.content}
              </div>
              {m.masked?.length ? (
                <p className="flex max-w-[85%] items-start gap-1.5 text-right text-xs text-fg-muted">
                  <ShieldCheck size={14} aria-hidden className="mt-px shrink-0" />
                  <span>
                    Скрыли {m.masked.map((k) => PII_LABELS[k]).join(', ')} — помощнику и специалисту
                    они не нужны. Не отправляйте персональные данные в чат.
                  </span>
                </p>
              ) : null}
            </li>
          );

        // служебная пометка (срок хранения и т. п.) — по центру, мелко
        if (m.role === 'system')
          return (
            <li key={m.id} className="text-center text-sm text-fg-muted">
              {m.content}
            </li>
          );

        if (m.kind === 'triage' && m.triage)
          return (
            <li key={m.id}>
              <TriageCard t={m.triage} />
            </li>
          );

        if (m.kind === 'hint')
          return (
            <li key={m.id} className="flex items-start gap-2 text-sm text-fg-muted">
              <Headset size={16} aria-hidden className="mt-0.5 shrink-0" />
              <span>{m.content}</span>
            </li>
          );

        if (m.kind === 'steps' && m.steps) {
          const active = m === lastSteps;
          // один шаг — простым текстом, как сказал бы человек (ТЗ v4.21)
          if (m.steps.length === 1) {
            const st = m.steps[0]!;
            return (
              <li key={m.id} className="flex flex-col gap-1">
                <Markdown
                  text={[m.content, `**${st.title}.** ${st.instruction}`, st.check]
                    .filter(Boolean)
                    .join('\n\n')}
                />
              </li>
            );
          }
          // несколько — компактный чек-лист: пройденные свёрнуты, текущий раскрыт, будущие — серые
          const steps = active && task.plan?.length ? task.plan : m.steps;
          const current = active && task.checkpoint === 'step' ? task.stepIndex : -1;
          return (
            <li key={m.id} className="flex flex-col gap-3">
              <p>{m.content}</p>
              <ol className="flex flex-col gap-1" aria-label="Шаги решения">
                {steps.map((st, i) => {
                  const res = 'result' in st ? st.result : undefined;
                  const isCurrent = i === current;
                  return (
                    <li
                      key={i}
                      aria-current={isCurrent ? 'step' : undefined}
                      className={cn(
                        'flex items-start gap-2.5 rounded-card px-3',
                        isCurrent
                          ? 'my-1 border border-accent bg-surface py-3 shadow-card'
                          : 'py-1.5',
                        !isCurrent && !res && 'text-fg-muted',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-medium',
                          res === 'ok'
                            ? 'bg-primary text-on-primary'
                            : res === 'fail'
                              ? 'border border-line-strong text-fg-muted'
                              : isCurrent
                                ? 'border border-accent text-heading'
                                : 'border border-line text-fg-muted',
                        )}
                      >
                        {res === 'ok' ? (
                          <Check size={12} />
                        ) : res === 'fail' ? (
                          <X size={12} />
                        ) : (
                          i + 1
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            isCurrent ? 'font-medium text-heading' : 'text-[15px]',
                            res === 'fail' && 'text-fg-muted line-through decoration-line-strong',
                            res === 'ok' && 'text-fg-muted',
                          )}
                        >
                          {st.title}
                          {res && (
                            <span className="sr-only">
                              {res === 'ok' ? ' — сделано' : ' — не подошло'}
                            </span>
                          )}
                        </p>
                        {res === 'fail' && (
                          <p aria-hidden className="text-xs text-fg-muted">
                            не подошло
                          </p>
                        )}
                        {isCurrent && st.instruction && (
                          <p className="mt-1 text-sm text-fg">{st.instruction}</p>
                        )}
                        {isCurrent && st.check && (
                          <p className="mt-2 text-sm font-medium text-heading">{st.check}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
              {current >= 0 && (
                <p className="text-sm text-fg-muted">
                  Расскажите внизу своими словами, как прошёл шаг.
                </p>
              )}
            </li>
          );
        }

        if (m.kind === 'handoff' && m.handoff)
          return (
            <li key={m.id} className="flex flex-col gap-3">
              <p className="flex items-start gap-2">
                <Headset size={18} className="mt-0.5 shrink-0" aria-hidden />
                {m.content}
              </p>
              <details className="group rounded-card border border-line bg-surface p-3" open>
                <summary className="cursor-pointer text-sm font-semibold text-heading">
                  Сводка для специалиста
                </summary>
                <HandoffSummary handoff={m.handoff} className="mt-3" />
                <div className="mt-2 -ml-2">
                  <CopyHandoff handoff={m.handoff} title={task.title} />
                </div>
              </details>
            </li>
          );

        if (m.kind === 'specialist')
          return (
            <li key={m.id} className="flex flex-col gap-1.5">
              <p className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
                <Headset size={14} aria-hidden />
                Специалист поддержки
              </p>
              <div className="max-w-[90%] rounded-card rounded-tl-[6px] border border-line-strong bg-surface px-3.5 py-2.5 whitespace-pre-wrap">
                {m.content}
              </div>
            </li>
          );

        if (m.kind === 'error')
          return (
            <li
              key={m.id}
              className="flex flex-col items-start gap-2 rounded-card border border-dashed border-line-strong bg-surface p-3"
            >
              <p className="flex items-start gap-2 text-sm">
                <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
                {m.content}
              </p>
              {m === lastError && task.status === 'error' && (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<RotateCcw size={16} />}
                  onClick={onRetry}
                >
                  Повторить
                </Button>
              )}
            </li>
          );

        if (m.kind === 'faq' && m.faq) {
          const active = m === lastFaq && task.checkpoint === 'faq';
          return (
            <li key={m.id} className="flex flex-col gap-3">
              <p className="flex items-start gap-2 rounded-card bg-sunken px-3.5 py-2.5 text-sm">
                <AlertCircle size={16} aria-hidden className="mt-0.5 shrink-0" />
                {m.content}
              </p>
              {active && (
                <>
                  <FaqChoices ids={m.faq} onPick={(id) => onFaq?.(id)} />
                  <SimilarThreads text={task.title} />
                  {onEscalate && (
                    <div>
                      <Button size="sm" icon={<Headset size={16} />} onClick={onEscalate}>
                        Передать специалисту
                      </Button>
                    </div>
                  )}
                </>
              )}
            </li>
          );
        }

        if (m.kind === 'questions' && m.questions) {
          const active = m === lastQuestions && task.checkpoint === 'questions';
          return (
            <li key={m.id} className="flex flex-col gap-3">
              <p>{m.content}</p>
              <ol className="flex flex-col gap-3">
                {m.questions.map((q, i) => {
                  const isCurrent = active && i === currentQ;
                  const answered = !active || i < currentQ;
                  return (
                    <li
                      key={i}
                      className={cn(
                        'rounded-card border bg-surface p-3',
                        isCurrent ? 'border-accent shadow-card' : 'border-line',
                      )}
                    >
                      <p
                        className={cn(
                          'font-medium',
                          answered && !isCurrent ? 'text-fg-muted' : 'text-heading',
                        )}
                      >
                        {i + 1}. {q.text}
                        {answered && !isCurrent && active && (
                          <span className="sr-only"> — отвечено</span>
                        )}
                      </p>
                      {isCurrent && (
                        <p className="mt-1 text-sm text-fg-muted">Ответьте в панели внизу</p>
                      )}
                    </li>
                  );
                })}
              </ol>
            </li>
          );
        }

        if (m.kind === 'plan' && m.plan) {
          const active = m === lastPlan && task.checkpoint === 'plan';
          const progress = task.plan && m === lastPlan ? task.plan : null;
          return (
            <li key={m.id} className="flex flex-col gap-3">
              <p>{m.content}</p>
              <ol className="flex flex-col gap-1.5 rounded-card border border-line bg-surface p-3">
                {m.plan.map((s, i) => {
                  const done = progress?.[i]?.done ?? false;
                  return (
                    <li key={i} className="flex items-start gap-2.5">
                      <span
                        aria-hidden
                        className={cn(
                          'mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-medium',
                          done
                            ? 'bg-primary text-on-primary'
                            : 'border border-line-strong text-fg-muted',
                        )}
                      >
                        {done ? <Check size={12} /> : i + 1}
                      </span>
                      <span className={cn(done && 'text-fg-muted')}>
                        {s}
                        {done && <span className="sr-only"> — выполнено</span>}
                      </span>
                    </li>
                  );
                })}
              </ol>
              {active && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    icon={<Check size={16} />}
                    onClick={onApprovePlan}
                    disabled={busy}
                  >
                    Подтвердить план
                  </Button>
                  <span className="text-sm text-fg-muted">или напишите ниже, что изменить</span>
                </div>
              )}
            </li>
          );
        }

        const canRegen =
          m === lastText &&
          !busy &&
          !live &&
          !m.canned &&
          !m.reaction &&
          task.checkpoint !== 'step' &&
          task.checkpoint !== 'offer';
        return (
          <li key={m.id} className="flex flex-col gap-1">
            <Markdown text={m.content} />
            <div className="-ml-2 flex flex-wrap items-center gap-1">
              <CopyButton text={m.content} />
              {canRegen && (
                <button
                  type="button"
                  onClick={onRegenerate}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2 text-xs text-fg-muted transition-colors duration-200 hover:bg-accent-soft hover:text-fg"
                >
                  <RefreshCw size={14} aria-hidden />
                  Перегенерировать
                </button>
              )}
              <span className="px-1">
                {m.canned ? (
                  <span className="text-xs text-fg-muted">готовая инструкция, без ИИ</span>
                ) : (
                  <ModelNote model={m.model} stopped={m.stopped} />
                )}
              </span>
            </div>
          </li>
        );
      })}

      {live && (
        <li className="flex flex-col gap-1" aria-busy="true">
          {live.text ? (
            <div className="flex flex-col gap-2">
              <Markdown text={live.text} />
              {/* пока текст пишется — мышь покачивается под ним */}
              <Logo
                variant="mark"
                size={20}
                decorative
                animate={task.difficulty === 'hard' ? 'breathe' : 'swing'}
              />
            </div>
          ) : (
            <Typing
              label="Помощник думает…"
              hard={task.difficulty === 'hard'}
              onStop={onStop}
              onEscalate={onQuickEscalate}
            />
          )}
        </li>
      )}

      {!live && task.status === 'awaiting_ai' && (
        <li>
          <Typing
            label={task.preview ?? 'Думаю…'}
            hard={task.difficulty === 'hard'}
            onEscalate={task.lastStep === 'handoff' ? undefined : onQuickEscalate}
          />
        </li>
      )}
    </ol>
  );
}
