import {
  canMoveManually,
  moveLabel,
  COLUMNS,
  isProblemTask,
  STATUS_LABELS,
  type ColumnId,
  type Task,
} from '@app/shared';
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  Check,
  GripVertical,
  Headset,
  UserCheck,
  MoreHorizontal,
  RotateCcw,
  Send,
  TimerOff,
  X,
} from 'lucide-react';
import { useId, useState, type HTMLAttributes, type ReactNode, type Ref } from 'react';
import { Logo } from '@/brand/Logo';
import { Button } from '@/components/ui/Button';
import { fieldClass } from '@/components/ui/Field';
import { IconButton } from '@/components/ui/IconButton';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { TaskTypeBadge } from '@/components/ui/TaskTypeBadge';
import { UrgentMark } from '@/components/ui/UrgentMark';
import { cn } from '@/lib/cn';
import { formatCountdown, formatWhen, plural } from '@/lib/format';
import { useNow } from '@/lib/useNow';
import { SectionChips } from './SectionChips';
import { sectionMenuItems } from './sectionMenu';
import { useSectionView } from './sectionView';
import { useBoard } from './store';

export type CardActions = {
  /** Открыть задачу как чат. */
  onOpen: () => void;
  onMove: (to: ColumnId) => void;
  onApprovePlan: () => void;
  /** Отправить черновик ИИ. */
  onSend: () => void;
  onAnswer: (text: string) => void;
  onAccept: () => void;
  onRework: () => void;
  onRetry: () => void;
  onUnschedule: () => void;
  // режим поддержки
  onSolved: () => void;
  onNotSolved: () => void;
};

export type TaskCardProps = {
  task: Task;
  actions?: CardActions;
  /** Ручка перетаскивания (атрибуты + клавиатура от dnd-kit). Без неё карточку не перетащить. */
  handleProps?: HTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> };
  /** Копия карточки под курсором во время перетаскивания. */
  overlay?: boolean;
  /** Место, где карточка стояла/встанет во время перетаскивания. */
  placeholder?: boolean;
  /** Компактный вид для переполненного столбца: без превью, прогресса и кнопок — детали в чате. */
  compact?: boolean;
};

export function StatusChip({ task }: { task: Task }) {
  const now = useNow();

  switch (task.status) {
    case 'awaiting_user':
      return (
        <span className="inline-flex h-6 min-w-0 items-center gap-1.5 rounded-full bg-accent-soft px-2 text-xs font-medium text-on-accent-soft">
          <span className="relative flex size-2 shrink-0" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-on-accent-soft opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-on-accent-soft" />
          </span>
          <span className="truncate">
            {STATUS_LABELS.awaiting_user}
            {task.pendingQuestions > 1 && ` · ${task.pendingQuestions}`}
          </span>
        </span>
      );
    case 'awaiting_ai':
      return (
        <span className="inline-flex h-6 min-w-0 items-center gap-1.5 text-xs text-fg-muted">
          <Logo variant="mark" size={16} decorative animate="swing" />
          <span className="truncate">{STATUS_LABELS.awaiting_ai}</span>
        </span>
      );
    case 'scheduled':
      return (
        <span
          className="inline-flex h-6 min-w-0 items-center gap-1.5 text-xs text-fg-muted"
          title={task.scheduledAt ? formatWhen(task.scheduledAt, now) : undefined}
        >
          <CalendarClock size={14} className="shrink-0" aria-hidden />
          <span className="truncate">
            {task.scheduledAt ? formatCountdown(task.scheduledAt, now) : STATUS_LABELS.scheduled}
          </span>
        </span>
      );
    case 'with_support': {
      const since = task.escalation?.createdAt;
      const min = since
        ? Math.max(0, Math.round((now - new Date(since).getTime()) / 60_000))
        : null;
      return (
        <span className="inline-flex h-6 min-w-0 items-center gap-1.5 rounded-full border border-line-strong px-2 text-xs font-medium text-fg">
          <Headset size={14} className="shrink-0" aria-hidden />
          <span className="truncate">
            {STATUS_LABELS.with_support}
            {min !== null && ` · ${min < 60 ? `${min} мин` : `${Math.round(min / 60)} ч`}`}
          </span>
        </span>
      );
    }
    case 'error':
      return (
        <span className="inline-flex h-6 min-w-0 items-center gap-1.5 rounded-full border border-line-strong px-2 text-xs font-medium text-fg">
          <AlertCircle size={14} className="shrink-0" aria-hidden />
          <span className="truncate">{STATUS_LABELS.error}</span>
        </span>
      );
    default:
      // пользователь сам перенёс в «Готово» (ТЗ v4.23)
      return task.column === 'done' && task.selfSolved ? (
        <span className="inline-flex h-6 min-w-0 items-center gap-1.5 rounded-full border border-line px-2 text-xs font-medium text-fg">
          <UserCheck size={14} className="shrink-0" aria-hidden />
          <span className="truncate">Решено самостоятельно</span>
        </span>
      ) : null;
  }
}

function PlanProgress({ plan }: { plan: NonNullable<Task['plan']> }) {
  const done = plan.filter((p) => p.done).length;
  const current = plan.find((p) => !p.done);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1" aria-hidden>
        {plan.map((p, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              p.done ? 'bg-accent' : 'bg-sunken ring-1 ring-line ring-inset',
            )}
          />
        ))}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-fg-muted">
        <Check size={13} aria-hidden className="shrink-0" />
        <span className="truncate">
          Этапов: {done} из {plan.length}
          {current && ` · сейчас: ${current.title.toLowerCase()}`}
        </span>
      </p>
    </div>
  );
}

function QuickReply({ onSend, questions }: { onSend: (text: string) => void; questions: number }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const inputId = useId();

  if (!open)
    return (
      <Button
        size="sm"
        variant="secondary"
        data-no-dnd
        onClick={() => setOpen(true)}
        className="relative z-10 self-start"
      >
        Ответить
        {questions > 1 && (
          <span className="sr-only">
            {' '}
            на {questions} {plural(questions, 'вопрос', 'вопроса', 'вопросов')}
          </span>
        )}
      </Button>
    );

  const submit = () => {
    if (!text.trim()) return;
    onSend(text);
    setText('');
    if (questions <= 1) setOpen(false);
  };

  return (
    <form
      data-no-dnd
      className="relative z-10 flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        Быстрый ответ
      </label>
      <input
        id={inputId}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- поле появляется по явному нажатию «Ответить»
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        placeholder="Ваш ответ…"
        className={cn(fieldClass, 'h-9 min-w-0 flex-1 text-sm')}
      />
      <IconButton
        type="submit"
        label="Отправить ответ"
        icon={<Send size={16} />}
        size="sm"
        disabled={!text.trim()}
      />
      <IconButton label="Отмена" icon={<X size={16} />} size="sm" onClick={() => setOpen(false)} />
    </form>
  );
}

function cardMenu(task: Task, a: CardActions): MenuItem[] {
  if (task.status === 'scheduled')
    return [
      {
        id: 'unschedule',
        label: 'Снять таймер',
        icon: <TimerOff size={16} />,
        onSelect: a.onUnschedule,
      },
    ];
  return [
    { kind: 'label', id: 'l', label: 'Переместить в столбец' },
    // вперёд двигает помощник; вручную — только назад или в «Готово» (ТЗ v4.23)
    ...COLUMNS.map((c): MenuItem => ({
      id: c,
      label: moveLabel(task.column, c),
      checked: task.column === c,
      disabled: !canMoveManually(task.column, c) || task.column === c,
      onSelect: () => a.onMove(c),
    })),
  ];
}

/**
 * Карточка задачи (ТЗ, п. 3): бейдж типа, состояние, превью, прогресс плана,
 * быстрый ответ на контрольной точке. Вся логика — в колбэках `actions`.
 */
export function TaskCard({
  task,
  actions,
  handleProps,
  overlay = false,
  placeholder = false,
  compact = false,
}: TaskCardProps) {
  const titleId = useId();
  const live = useBoard((s) => s.live[task.id]?.text);
  const sections = useBoard((s) => s.sections);
  const view = useSectionView();
  const inReview = task.status === 'awaiting_user' && task.checkpoint === 'review';
  const atPlan = task.status === 'awaiting_user' && task.checkpoint === 'plan';
  const atStep = task.status === 'awaiting_user' && task.checkpoint === 'step';
  const atOffer = task.status === 'awaiting_user' && task.checkpoint === 'offer';
  const atQuestions =
    task.status === 'awaiting_user' && !inReview && !atPlan && !atStep && !atOffer;
  // Обращение-проблема (а не вопрос-консультация): проверка звучит как «Закрыть вопрос / Не помогло»
  const problem = isProblemTask(task);
  const questionNo =
    task.checkpoint === 'questions' && task.questions
      ? task.questions.length - task.pendingQuestions + 1
      : null;

  let footer: ReactNode = null;
  if (actions && !overlay) {
    if (inReview && problem)
      footer = (
        <div className="relative z-10 flex flex-wrap gap-2" data-no-dnd>
          <Button size="sm" icon={<Check size={16} />} onClick={actions.onSolved}>
            Закрыть вопрос
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<RotateCcw size={16} />}
            onClick={actions.onNotSolved}
          >
            Не помогло
          </Button>
        </div>
      );
    else if (atStep) {
      // ответ на шаг — только своими словами (ТЗ v4.23)
      const step = task.plan?.[task.stepIndex];
      footer = (
        <div className="relative z-10 flex flex-col gap-2" data-no-dnd>
          {step?.check && <p className="text-sm font-medium text-heading">{step.check}</p>}
          <QuickReply onSend={actions.onAnswer} questions={1} />
        </div>
      );
    } else if (atOffer) {
      // специалист — только с согласия (ТЗ v4.21)
      footer = (
        <div className="relative z-10 flex flex-col gap-2" data-no-dnd>
          <p className="text-sm font-medium text-heading">Передать обращение специалисту?</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              icon={<Headset size={16} />}
              onClick={() => actions.onAnswer('Передать специалисту')}
            >
              Передать
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => actions.onAnswer(task.offer?.continueLabel || 'Продолжить с ИИ')}
            >
              {task.offer?.continueLabel || 'Продолжить с ИИ'}
            </Button>
          </div>
        </div>
      );
    } else if (inReview && task.reviewButtons)
      // кнопки по смыслу ответа (ТЗ v4.13): «Да, записался / Не получилось»
      footer = (
        <div className="relative z-10 flex flex-wrap gap-2" data-no-dnd>
          <Button size="sm" icon={<Check size={16} />} onClick={actions.onAccept}>
            {task.reviewButtons[0]}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<RotateCcw size={16} />}
            onClick={() => actions.onAnswer(task.reviewButtons![1])}
          >
            {task.reviewButtons[1]}
          </Button>
        </div>
      );
    else if (inReview)
      footer = (
        <div className="relative z-10 flex flex-wrap gap-2" data-no-dnd>
          <Button size="sm" icon={<Check size={16} />} onClick={actions.onAccept}>
            Принять
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<RotateCcw size={16} />}
            onClick={actions.onRework}
          >
            Доработать
          </Button>
        </div>
      );
    else if (atPlan)
      footer = (
        <div className="relative z-10 flex flex-wrap gap-2" data-no-dnd>
          <Button size="sm" icon={<Check size={16} />} onClick={actions.onApprovePlan}>
            Подтвердить план
          </Button>
          <Button size="sm" variant="secondary" onClick={actions.onOpen}>
            Изменить
          </Button>
        </div>
      );
    else if (atQuestions && task.checkpoint === 'ask' && task.replyOptions?.length)
      // ответ на встречный вопрос помощника — вариантом или своими словами
      footer = (
        <div className="relative z-10 flex flex-col gap-2" data-no-dnd>
          <div className="flex flex-wrap gap-2">
            {task.replyOptions.map((o) => (
              <Button key={o} size="sm" variant="secondary" onClick={() => actions.onAnswer(o)}>
                {o}
              </Button>
            ))}
          </div>
          <QuickReply onSend={actions.onAnswer} questions={1} />
        </div>
      );
    else if (atQuestions)
      footer = <QuickReply onSend={actions.onAnswer} questions={task.pendingQuestions} />;
    else if (task.status === 'error')
      footer = (
        <div className="relative z-10 flex flex-col items-start gap-2" data-no-dnd>
          {task.errorMessage && <p className="text-sm text-fg-muted">{task.errorMessage}</p>}
          <Button
            size="sm"
            variant="secondary"
            icon={<RotateCcw size={16} />}
            onClick={actions.onRetry}
          >
            Повторить
          </Button>
        </div>
      );
  }

  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        'group relative flex flex-col rounded-card border bg-surface text-fg',
        compact ? 'gap-1.5 p-2.5' : 'gap-2 p-3',
        'transition-[box-shadow,border-color,opacity] duration-200',
        task.status === 'awaiting_user' || task.urgentRequest ? 'border-accent' : 'border-line',
        task.status === 'error' && 'border-dashed border-line-strong',
        overlay ? 'rotate-[1.5deg] cursor-grabbing shadow-raised' : 'shadow-card',
        placeholder && 'opacity-40',
      )}
    >
      <div className="flex items-start gap-2">
        {/* бейджи переносятся на новую строку в узком столбце, кнопки справа не выталкиваются */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <TaskTypeBadge structure={task.structure} difficulty={task.difficulty} />
          {task.urgentRequest && <UrgentMark reason={task.urgentRequest.reason} />}
          {task.recipient === 'support' && task.status !== 'with_support' && (
            <span title="Адресат — оператор поддержки" className="inline-flex text-fg-muted">
              <Headset size={15} aria-hidden />
              <span className="sr-only">Адресат — поддержка</span>
            </span>
          )}
        </div>
        <div className="relative z-10 flex items-center gap-2">
          {actions && !overlay && (
            <Menu
              label={`Действия: ${task.title}`}
              icon={<MoreHorizontal size={18} />}
              items={[...cardMenu(task, actions), ...sectionMenuItems(task, sections, view)]}
              triggerClassName="-my-1.5"
            />
          )}
          {(handleProps || overlay) && (
            <IconButton
              {...handleProps}
              label={`Перетащить: ${task.title}`}
              icon={<GripVertical size={18} />}
              size="sm"
              className={cn(
                '-my-1.5 -mr-1.5 touch-none text-fg-muted',
                overlay ? 'cursor-grabbing' : 'cursor-grab',
              )}
            />
          )}
        </div>
      </div>

      <h3
        id={titleId}
        className={cn(
          'text-[15px] leading-snug font-medium text-heading',
          compact ? 'line-clamp-2' : 'line-clamp-3',
        )}
      >
        {actions && !overlay ? (
          // Вся карточка кликабельна (растянутая кнопка), остальные элементы — поверх (z-10)
          <button
            type="button"
            onClick={actions.onOpen}
            draggable={false}
            className="text-left after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-focus"
          >
            {task.title}
          </button>
        ) : (
          task.title
        )}
      </h3>

      {compact ? null : live ? (
        <p className="line-clamp-2 text-sm text-fg-muted" aria-live="off">
          {live
            .replace(/[#*`>|_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .slice(-140)}
        </p>
      ) : (
        task.preview && (
          <p className="line-clamp-2 text-sm text-fg-muted">
            {questionNo !== null && task.questions && task.questions.length > 1 && (
              <span className="font-medium text-fg">
                Вопрос {questionNo} из {task.questions.length}:{' '}
              </span>
            )}
            {task.preview}
          </p>
        )
      )}

      {!compact && task.plan && task.column === 'working' && task.status !== 'with_support' && (
        <PlanProgress plan={task.plan} />
      )}

      {!compact && <SectionChips task={task} sections={sections} view={view} />}

      {task.status !== 'idle' && (
        <div className="flex min-w-0">
          <StatusChip task={task} />
        </div>
      )}

      {!compact && footer}

      {!compact && task.column === 'draft' && task.status === 'idle' && actions && !overlay && (
        <button
          type="button"
          data-no-dnd
          onClick={actions.onSend}
          className="relative z-10 inline-flex items-center gap-1 self-start rounded-[8px] text-sm font-medium text-heading underline-offset-4 hover:underline"
        >
          Отправить ИИ
          <ArrowRight size={15} aria-hidden />
        </button>
      )}
    </article>
  );
}
