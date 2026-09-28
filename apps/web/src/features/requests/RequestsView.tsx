import { GENERAL_SECTION_ID, isManualSection, URGENCY_ORDER, type Task } from '@app/shared';
import { ChevronDown, Headset, ListPlus, MessageSquareText, Plus, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Logo } from '@/brand/Logo';
import { Button } from '@/components/ui/Button';
import { SectionDot } from '@/components/ui/SectionDot';
import { StageTrack } from '@/components/ui/StageTrack';
import { UrgencyBadge } from '@/components/ui/UrgencyBadge';
import * as agent from '@/features/agent/agent';
import { inSection, useBoard, userSections } from '@/features/board/store';
import { useAddToSection } from '@/features/sections/addStore';
import { TaskPanel } from '@/features/task/TaskPanel';
import { cn } from '@/lib/cn';
import { useUser } from '@/lib/session';
import { AiUnavailableBanner } from '@/features/agent/AiUnavailableBanner';
import { RequestComposer } from './RequestComposer';
import { statusText } from './status';

const needsYou = (t: Task) => t.status === 'awaiting_user' || t.status === 'error';
const byRecent = (a: Task, b: Task) => b.updatedAt.localeCompare(a.updatedAt);

/** Одно обращение в списке: спокойная строка без рамок, путь из 5 этапов и статус. */
function RequestItem({
  task,
  active,
  onOpen,
}: {
  task: Task;
  active: boolean;
  onOpen: () => void;
}) {
  const live = useBoard((s) => s.live[task.id]?.text);
  const preview = live
    ? live
        .replace(/[#*`>|_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .slice(-120)
    : task.preview;
  const attention = needsYou(task) && task.column !== 'done';
  return (
    <motion.li layout="position" transition={{ duration: 0.25 }}>
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'flex w-full flex-col gap-1 rounded-card px-3 py-2.5 text-left transition-[background-color,box-shadow] duration-200',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
          active ? 'bg-surface shadow-card ring-1 ring-line' : 'hover:bg-surface',
        )}
      >
        <span className="flex items-start gap-2">
          {attention && (
            <span aria-hidden className="mt-[7px] size-2 shrink-0 rounded-full bg-primary" />
          )}
          <span className="line-clamp-2 min-w-0 flex-1 text-[15px] leading-snug font-medium text-heading">
            {task.title}
          </span>
          {task.urgency === 'critical' && <UrgencyBadge urgency={task.urgency} />}
        </span>
        {preview && <span className="line-clamp-1 text-sm text-fg-muted">{preview}</span>}
        <span className="mt-0.5 flex items-center gap-2.5">
          <StageTrack column={task.column} />
          {task.status === 'awaiting_ai' && (
            <Logo variant="mark" size={16} decorative animate="swing" />
          )}
          <span
            className={cn(
              'truncate text-xs',
              attention ? 'font-medium text-heading' : 'text-fg-muted',
            )}
          >
            {statusText(task)}
          </span>
        </span>
      </button>
    </motion.li>
  );
}

function Group({
  title,
  tasks,
  activeId,
  onOpen,
}: {
  title: string;
  tasks: Task[];
  activeId?: string;
  onOpen: (id: string) => void;
}) {
  if (!tasks.length) return null;
  return (
    <section className="flex flex-col gap-1" aria-label={title}>
      <h2 className="px-3 pb-1 text-xs font-medium text-fg-muted">
        {title} · {tasks.length}
      </h2>
      <ul className="flex flex-col gap-0.5">
        {tasks.map((t) => (
          <RequestItem key={t.id} task={t} active={t.id === activeId} onOpen={() => onOpen(t.id)} />
        ))}
      </ul>
    </section>
  );
}

function greeting(name: string | undefined): string {
  const h = new Date().getHours();
  const part =
    h >= 5 && h < 12
      ? 'Доброе утро'
      : h >= 12 && h < 17
        ? 'Добрый день'
        : h >= 17 && h < 23
          ? 'Добрый вечер'
          : 'Доброй ночи';
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}

/** Главная (desktop): приветствие и крупное поле по центру — как у современных ИИ-чатов. */
function Home({ onSubmit }: { onSubmit: (text: string) => void }) {
  const user = useUser();
  return (
    <div className="scroll-paper hidden flex-1 overflow-y-auto lg:flex">
      <div className="m-auto flex w-full max-w-[680px] flex-col gap-6 px-8 py-12">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo variant="mark" size={40} decorative />
          <h2 className="font-serif text-[34px] leading-tight font-normal tracking-[-0.02em] text-heading">
            {greeting(user?.name)}
          </h2>
          <p className="text-fg-muted">
            Что случилось? Помощник разберётся и подскажет, что делать.
          </p>
        </div>
        <AiUnavailableBanner />
        <RequestComposer variant="hero" onSubmit={onSubmit} />
        <ol className="grid grid-cols-3 gap-4 pt-2 text-sm text-fg-muted">
          <li className="flex flex-col gap-1.5">
            <MessageSquareText size={18} aria-hidden />
            Пишете своими словами — без категорий и терминов.
          </li>
          <li className="flex flex-col gap-1.5">
            <Sparkles size={18} aria-hidden />
            Помощник спрашивает только нужное и ведёт по шагам.
          </li>
          <li className="flex flex-col gap-1.5">
            <Headset size={18} aria-hidden />
            Не вышло — специалист получит готовую сводку.
          </li>
        </ol>
      </div>
    </div>
  );
}

/**
 * Пусто: в «Общем» — новый личный кабинет (примеры по кнопке); в разделе — как его пополнить.
 */
function EmptyList({ sectionId }: { sectionId: string }) {
  const section = useBoard((s) => s.sections.find((x) => x.id === sectionId));
  const own = sectionId !== GENERAL_SECTION_ID && !!section;
  return (
    <div className="mx-1 flex flex-col items-start gap-3 rounded-card border border-line bg-surface p-4 lg:mx-3">
      <p className="text-sm">
        {!own
          ? 'Это ваш личный кабинет. Здесь будут ваши обращения — их видите только вы.'
          : isManualSection(section)
            ? 'В разделе пока пусто. Отметьте обращения, которые хотите держать вместе.'
            : 'ИИ пока не нашёл подходящих обращений. Можно добавить их и самому.'}
      </p>
      {own ? (
        <Button
          size="sm"
          variant="secondary"
          icon={<ListPlus size={16} />}
          onClick={() => useAddToSection.getState().open(sectionId)}
        >
          Добавить обращения
        </Button>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          icon={<Sparkles size={16} />}
          onClick={() => useBoard.getState().addDemo()}
        >
          Показать примеры
        </Button>
      )}
    </div>
  );
}

/**
 * Главный экран сотрудника (ТЗ v4.0, п. 3): список обращений и чат.
 * Путь каждого обращения — полоска из 5 этапов; канбан-доска — по переключателю «Доска».
 */
export function RequestsView({ sectionId, taskId }: { sectionId: string; taskId?: string }) {
  const tasks = useBoard((s) => s.tasks);
  const sections = useBoard((s) => s.sections);
  const navigate = useNavigate();
  const open = (id: string) => navigate(`/s/${sectionId}/t/${id}`);

  const { waiting, active, done, total } = useMemo(() => {
    const list = Object.values(tasks).filter((t) => inSection(t, sectionId));
    return {
      waiting: list
        .filter((t) => t.column !== 'done' && needsYou(t))
        .sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] || byRecent(a, b)),
      active: list.filter((t) => t.column !== 'done' && !needsYou(t)).sort(byRecent),
      done: list.filter((t) => t.column === 'done').sort(byRecent),
      total: list.length,
    };
  }, [tasks, sectionId]);

  const own = userSections(sections);
  const create = (text: string) => {
    const id = useBoard.getState().createTask(text, sectionId);
    void agent.start(id);
    open(id);
  };

  return (
    <div className="flex h-full">
      <div
        className={cn(
          'scroll-paper flex w-full flex-col gap-4 overflow-y-auto p-3 sm:p-4 lg:w-[360px] lg:shrink-0 lg:border-r lg:border-line lg:p-3 [&>*]:shrink-0',
          taskId && 'hidden lg:flex',
        )}
      >
        {/* телефон: поле ввода вверху списка; компьютер: крупное поле по центру (Home) */}
        <div className="flex flex-col gap-3 lg:hidden">
          <AiUnavailableBanner />
          <RequestComposer onSubmit={create} />
        </div>
        <div className="hidden items-center justify-between gap-2 px-3 pt-1 lg:flex">
          <span className="text-sm font-medium text-heading">Обращения</span>
          <button
            type="button"
            onClick={() => navigate(`/s/${sectionId}`)}
            className="inline-flex h-8 items-center gap-1.5 rounded-control px-2.5 text-sm text-fg-muted transition-colors duration-200 hover:bg-surface hover:text-fg"
          >
            <Plus size={16} aria-hidden />
            Новое
          </button>
        </div>

        {own.length > 0 && (
          <nav aria-label="Разделы" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:px-3">
            {[{ id: GENERAL_SECTION_ID, name: 'Все', color: null }, ...own].map((s) => (
              <button
                key={s.id}
                type="button"
                aria-current={s.id === sectionId ? 'page' : undefined}
                onClick={() => navigate(`/s/${s.id}`)}
                className={cn(
                  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm transition-colors duration-200',
                  s.id === sectionId
                    ? 'bg-surface font-medium text-heading shadow-card ring-1 ring-line'
                    : 'text-fg-muted hover:bg-surface hover:text-fg',
                )}
              >
                {s.color && <SectionDot color={s.color} />}
                {s.name}
              </button>
            ))}
          </nav>
        )}

        <Group title="Нужен ваш ответ" tasks={waiting} activeId={taskId} onOpen={open} />
        <Group title="В работе" tasks={active} activeId={taskId} onOpen={open} />
        {done.length > 0 && (
          <details className="group flex flex-col">
            <summary className="flex cursor-pointer list-none items-center gap-1 px-3 text-xs font-medium text-fg-muted select-none">
              <ChevronDown
                size={14}
                aria-hidden
                className="-rotate-90 transition-transform duration-200 group-open:rotate-0"
              />
              Решённые · {done.length}
            </summary>
            <ul className="mt-2 flex flex-col gap-0.5">
              {done.map((t) => (
                <RequestItem
                  key={t.id}
                  task={t}
                  active={t.id === taskId}
                  onOpen={() => open(t.id)}
                />
              ))}
            </ul>
          </details>
        )}
        {total === 0 && <EmptyList sectionId={sectionId} />}
      </div>

      {taskId ? (
        <TaskPanel
          key={taskId}
          taskId={taskId}
          layout="main"
          onClose={() => navigate(`/s/${sectionId}`)}
        />
      ) : (
        <Home onSubmit={create} />
      )}
    </div>
  );
}
