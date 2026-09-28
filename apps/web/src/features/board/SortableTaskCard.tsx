import type { Task } from '@app/shared';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'motion/react';
import type { SyntheticEvent } from 'react';
import { TaskCard, type CardActions } from './TaskCard';

type Props = {
  task: Task;
  actions: CardActions;
  /** Идёт ли сейчас перетаскивание на доске: тогда анимации Motion выключены, двигает dnd-kit. */
  boardDragging: boolean;
  compact?: boolean;
};

/** Не начинаем перетаскивание, если нажали на поле ввода или кнопку внутри карточки. */
const NO_DND = 'input, textarea, select, [contenteditable="true"], [data-no-dnd]';

function guard<E extends SyntheticEvent>(handler?: (e: E) => void) {
  if (!handler) return undefined;
  return (e: E) => {
    if ((e.target as HTMLElement).closest(NO_DND)) return;
    handler(e);
  };
}

/**
 * Карточка, которую можно перетаскивать.
 * - Мышь: тянуть за любое место карточки (после сдвига на 6 px — клики работают как обычно).
 * - Палец: долгое нажатие ~250 мс, чтобы не мешать прокрутке.
 * - Клавиатура: фокус на ручке ⋮⋮, пробел — взять, стрелки — двигать, пробел — отпустить, Esc — отмена.
 *
 * Внешний motion.div с layoutId даёт плавный «перелёт» карточки между столбцами
 * (200–400 мс), когда её перемещают не мышью — через меню, быстрый ответ, «Принять».
 */
export function SortableTaskCard({ task, actions, boardDragging, compact = false }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: 'task', column: task.column },
    attributes: { roleDescription: 'карточка задачи' },
  });

  const { onKeyDown, onMouseDown, onTouchStart } = (listeners ?? {}) as Record<
    string,
    ((e: SyntheticEvent) => void) | undefined
  >;

  return (
    <motion.li
      layout={boardDragging ? false : 'position'}
      layoutId={boardDragging ? undefined : task.id}
      transition={{ duration: 0.32, ease: [0.2, 0.7, 0.2, 1] }}
      className="list-none"
      data-task-id={task.id}
    >
      {/* Мышь и палец тянут за всю карточку; клавиатурный доступ — через ручку внутри (handleProps). */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform), transition }}
        onMouseDown={guard(onMouseDown)}
        onTouchStart={guard(onTouchStart)}
      >
        <TaskCard
          compact={compact}
          task={task}
          actions={actions}
          placeholder={isDragging}
          handleProps={{ ...attributes, onKeyDown, ref: setActivatorNodeRef }}
        />
      </div>
    </motion.li>
  );
}
