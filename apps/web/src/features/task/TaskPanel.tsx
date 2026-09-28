import { isBackwardMove, isProblemTask, type ColumnId } from '@app/shared';
import { Check, CheckCheck, Headset, RotateCcw } from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import * as agent from '@/features/agent/agent';
import { useLlmStatus } from '@/features/agent/llmStatus';
import { ReworkDialog } from '@/features/board/ReworkDialog';
import { useBoard, useViewMode } from '@/features/board/store';
import { cn } from '@/lib/cn';
import { QuestionDock } from './QuestionDock';
import { Composer, type ComposerHandle } from './Composer';
import { ShareSolution } from '@/features/forum/ShareSolution';
import { MessageList } from './MessageList';
import { TaskHeader } from './TaskHeader';

type Props = {
  taskId: string;
  onClose: () => void;
  /** side — панель справа от доски; main — основная область рядом со списком обращений. */
  layout?: 'side' | 'main';
};

function placeholderFor(checkpoint: string | null, column: ColumnId, withSupport: boolean): string {
  if (withSupport) return 'Написать специалисту — он увидит это сообщение…';
  if (checkpoint === 'faq') return 'Опишите подробнее — подберу похожие вопросы…';
  if (checkpoint === 'describe') return 'Напишите, что случилось или с чем помочь…';
  if (checkpoint === 'step') return 'Опишите, что получилось или что пошло не так…';
  if (checkpoint === 'questions') return 'Ваш ответ на вопрос…';
  if (checkpoint === 'ask') return 'Ответьте своими словами…';
  if (checkpoint === 'plan') return 'Напишите «да» или что изменить в плане…';
  if (column === 'draft') return 'Дополните обращение или нажмите «Отправить ИИ»…';
  return 'Что не так? Или задайте уточняющий вопрос…';
}

/** Строка состояния модели внизу чата. */
function ModelLine() {
  const { status, offline } = useLlmStatus();
  const model = useBoard((s) => s.settings.model);
  let text = 'Проверяю подключение к модели…';
  let ok = false;
  if (offline) text = 'Сервер Канбата не отвечает';
  else if (status?.provider === 'ollama' || status?.provider === 'openai') {
    ok = true;
    const name = model && status.models.includes(model) ? model : status.model;
    text = `${name} · ${status.provider === 'openai' ? 'облачный ИИ' : 'через Ollama'}`;
  } else if (status?.demo) text = 'Демо-режим: ответы-заготовки вместо ИИ';
  else if (status) text = 'ИИ недоступен — готовые инструкции и специалист';
  return (
    <p className="flex items-center gap-1.5 px-1 text-xs text-fg-muted" role="status">
      <span
        aria-hidden
        className={cn('size-2 rounded-full', ok ? 'bg-accent' : 'border border-line-strong')}
      />
      {text}
    </p>
  );
}

/**
 * Задача как чат (ТЗ, п. 4): на desktop — правая панель ≈45 % (или весь экран),
 * на mobile/tablet — полноэкранный экран с «Назад к доске».
 */
export function TaskPanel({ taskId, onClose, layout = 'side' }: Props) {
  const main = layout === 'main';
  const board = useViewMode() === 'board';
  const task = useBoard((s) => s.tasks[taskId]);
  const messages = useBoard((s) => s.messages[taskId]);
  const live = useBoard((s) => s.live[taskId]);
  const [fullscreen, setFullscreen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const composer = useRef<ComposerHandle>(null);
  const [reworking, setReworking] = useState(false);
  const titleRef = useRef<HTMLDivElement>(null);

  const busy = !!live || task?.status === 'awaiting_ai';

  // Прокрутка вниз при новых сообщениях — если пользователь не листает историю вверх
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages?.length, live?.text, task?.status]);

  useEffect(() => {
    stick.current = true;
    titleRef.current?.focus({ preventScroll: true });
  }, [taskId]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // Esc внутри диалога или меню закрывает их, а не панель
      if ((e.target as HTMLElement).closest('[role="dialog"]:not(aside), [role="menu"]')) return;
      onClose();
    },
    [onClose],
  );

  if (!task) {
    return (
      <aside className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-canvas p-6 text-center lg:absolute lg:inset-y-0 lg:right-0 lg:left-auto lg:z-20 lg:w-[45%] lg:border-l lg:border-line lg:shadow-raised">
        <p className="text-fg-muted">Задача не найдена — возможно, её удалили.</p>
        <Button variant="secondary" onClick={onClose}>
          К доске
        </Button>
      </aside>
    );
  }

  const move = (to: ColumnId) => {
    if (to === task.column) return;
    if (to === 'done') return void agent.accept(task.id);
    if (task.column === 'draft') {
      if (to !== 'draft') return void agent.start(task.id);
    }
    if (isBackwardMove(task.column, to) && to !== 'draft') {
      useBoard.getState().placeTask(task.id, to, 0);
      composer.current?.focus();
      return;
    }
    useBoard.getState().moveTask(task.id, to, 0);
  };

  const inReview = task.checkpoint === 'review' && task.status === 'awaiting_user';
  // Панель ответа внизу (ТЗ v4.14): вопросы уточнения по одному или встречный вопрос помощника
  const waiting = task.status === 'awaiting_user';
  const qs = waiting && task.checkpoint === 'questions' ? (task.questions ?? []) : [];
  const qIndex = qs.length - task.pendingQuestions;
  const currentQ = qs[qIndex];
  const dock = currentQ
    ? {
        counter: qs.length > 1 ? `Вопрос ${qIndex + 1} из ${qs.length}` : null,
        question: currentQ.text,
        options: currentQ.options,
        skip: true,
      }
    : waiting && task.checkpoint === 'ask'
      ? {
          counter: null,
          question: task.askText || 'Ответьте на вопрос помощника выше',
          options: task.replyOptions ?? [],
          skip: false,
        }
      : null;
  const withSupport = task.status === 'with_support';
  // Обращение-проблема: проверка звучит как «Решено? / Не помогло»
  const problem = isProblemTask(task);
  const canEscalate =
    task.column !== 'draft' &&
    task.column !== 'done' &&
    !withSupport &&
    task.status !== 'awaiting_ai' &&
    !(task.escalation && task.escalation.status !== 'resolved');
  // ИИ долго думает — передать сразу (сводка из переписки, без ожидания модели)
  const canQuickEscalate =
    task.column !== 'done' &&
    !withSupport &&
    !(task.escalation && task.escalation.status !== 'resolved');

  return (
    <motion.aside
      aria-label={`Задача: ${task.title}`}
      onKeyDown={onKeyDown}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: [0.2, 0.7, 0.2, 1] }}
      className={cn(
        'fixed inset-0 z-30 flex flex-col bg-canvas',
        main
          ? 'lg:static lg:z-auto lg:min-w-0 lg:flex-1'
          : fullscreen
            ? 'lg:fixed lg:inset-0'
            : // доска: чат выезжает поверх столбцов, доска под ним не сдвигается и не сужается
              'lg:absolute lg:inset-y-0 lg:right-0 lg:left-auto lg:z-20 lg:w-[45%] lg:min-w-[420px] lg:border-l lg:border-line lg:shadow-raised',
      )}
    >
      <div ref={titleRef} tabIndex={-1} className="outline-none">
        <TaskHeader
          task={task}
          fullscreen={fullscreen}
          onToggleFullscreen={main ? undefined : () => setFullscreen((v) => !v)}
          backLabel={main ? 'К списку обращений' : 'Назад к доске'}
          showKind={board}
          onClose={onClose}
          onRename={(title) => useBoard.getState().patchTask(task.id, { title, titleEdited: true })}
          onMove={move}
          onKind={(structure, difficulty) =>
            useBoard.getState().patchTask(task.id, { structure, difficulty })
          }
          onDelete={() => setConfirmDelete(true)}
          onEscalate={canEscalate ? () => void agent.escalate(task.id) : undefined}
        />
      </div>

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        // прокручиваемая переписка доступна с клавиатуры (стрелки, PageDown), даже без кнопок внутри (axe)
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        role="region"
        aria-label="Переписка с помощником"
        className="scroll-paper min-h-0 flex-1 overflow-y-auto focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
      >
        <div
          className={cn(
            'mx-auto flex max-w-[720px] flex-col gap-6 px-4 py-6',
            fullscreen && 'lg:px-8',
          )}
        >
          <MessageList
            task={task}
            messages={messages ?? []}
            live={live}
            busy={busy}
            onApprovePlan={() => void agent.approvePlan(task.id)}
            onRegenerate={() => void agent.regenerate(task.id)}
            onRetry={() => void agent.retry(task.id)}
            onStepDone={() => void agent.stepDone(task.id)}
            onStepFail={() => void agent.notSolved(task.id)}
            onFaq={(topicId) => void agent.faqAnswer(task.id, topicId)}
            onEscalate={canEscalate ? () => void agent.escalate(task.id) : undefined}
            onStop={() => agent.stop(task.id)}
            onQuickEscalate={
              canQuickEscalate
                ? () => void agent.escalate(task.id, 'ИИ долго не отвечал', true)
                : undefined
            }
          />
        </div>
      </div>

      <div className="border-t border-line bg-canvas px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
        <div className={cn('mx-auto flex max-w-[720px] flex-col gap-2')}>
          {inReview && problem && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                icon={<Check size={16} />}
                onClick={() => void agent.solved(task.id)}
              >
                Решено
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={<RotateCcw size={16} />}
                onClick={() => void agent.notSolved(task.id)}
              >
                Не помогло
              </Button>
              <span className="text-sm text-fg-muted">Проблема решена?</span>
            </div>
          )}
          {withSupport && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted">
              <Headset size={16} aria-hidden className="shrink-0" />
              Обращение у специалиста. Можно дописать детали — он их увидит.
            </p>
          )}
          {inReview && !problem && task.reviewButtons && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                icon={<Check size={16} />}
                onClick={() => void agent.accept(task.id)}
              >
                {task.reviewButtons[0]}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={<RotateCcw size={16} />}
                onClick={() => void agent.reply(task.id, task.reviewButtons![1])}
              >
                {task.reviewButtons[1]}
              </Button>
              <span className="text-sm text-fg-muted">Проверьте результат</span>
            </div>
          )}
          {inReview && !problem && !task.reviewButtons && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                icon={<Check size={16} />}
                onClick={() => void agent.accept(task.id)}
              >
                Принять
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={<RotateCcw size={16} />}
                onClick={() => setReworking(true)}
              >
                Доработать
              </Button>
              <span className="text-sm text-fg-muted">Результат ждёт вашей проверки</span>
            </div>
          )}
          {task.checkpoint === 'describe' && task.status === 'awaiting_user' && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={<CheckCheck size={16} />}
                onClick={() => void agent.close(task.id)}
              >
                Закрыть обращение
              </Button>
              <span className="text-sm text-fg-muted">если помощь не нужна</span>
            </div>
          )}
          {task.column === 'done' &&
            task.status === 'idle' &&
            task.triage?.meaningful !== false &&
            (messages?.length ?? 0) > 2 && <ShareSolution task={task} messages={messages ?? []} />}
          {task.column === 'draft' && task.status === 'idle' && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => void agent.start(task.id)}>
                Отправить ИИ
              </Button>
              <span className="text-sm text-fg-muted">
                ИИ разберёт обращение и подскажет, что делать
              </span>
            </div>
          )}
          {dock ? (
            <QuestionDock
              counter={dock.counter}
              question={dock.question}
              options={dock.options}
              busy={busy}
              onAnswer={(t) => {
                stick.current = true;
                void agent.reply(task.id, t);
              }}
              onSkip={dock.skip ? () => void agent.skipQuestion(task.id) : undefined}
              onSkipAll={() => void agent.answerWithoutQuestions(task.id)}
            />
          ) : (
            <Composer
              ref={composer}
              placeholder={placeholderFor(task.checkpoint, task.column, withSupport)}
              busy={busy}
              disabled={task.status === 'scheduled'}
              onSend={(t) => {
                stick.current = true;
                void agent.reply(task.id, t);
              }}
              onStop={() => agent.stop(task.id)}
            />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ModelLine />
            {canEscalate && (
              <Button
                size="sm"
                variant="ghost"
                icon={<Headset size={16} />}
                onClick={() => void agent.escalate(task.id)}
                className="-my-1"
              >
                Позвать специалиста
              </Button>
            )}
          </div>
        </div>
      </div>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Удалить задачу?"
        description={`«${task.title}» и вся переписка будут удалены без возможности восстановления.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Отмена
            </Button>
            <Button
              data-autofocus
              onClick={() => {
                setConfirmDelete(false);
                agent.remove(task.id);
                onClose();
              }}
            >
              Удалить
            </Button>
          </>
        }
      >
        {null}
      </Dialog>

      {/* «Доработать»: что изменить — и ответ переписывается (как «Доработать» на карточке) */}
      <ReworkDialog
        task={reworking ? task : undefined}
        from={task.column}
        to="working"
        onCancel={() => setReworking(false)}
        onConfirm={(note) => {
          setReworking(false);
          void agent.rework(task.id, note);
        }}
      />
    </motion.aside>
  );
}
