import { COLUMN_LABELS, COLUMNS, isBackwardMove, type ColumnId, type Task } from '@app/shared';
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { LayoutGroup } from 'motion/react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import * as agent from '@/features/agent/agent';
import { safeStorage } from '@/lib/storage';
import { cn } from '@/lib/cn';
import { Column } from './Column';
import { ColumnFullView } from './ColumnFullView';
import { columnFromDropId } from './dndIds';
import { ReworkDialog } from './ReworkDialog';
import { selectColumn, selectScheduled, useBoard, type BoardSnapshot } from './store';
import { SectionView } from './sectionView';
import { TaskCard, type CardActions } from './TaskCard';

const COLLAPSE_KEY = 'kc-collapsed-columns';

function readCollapsed(): ColumnId[] {
  try {
    const v = JSON.parse(safeStorage.get(COLLAPSE_KEY) ?? 'null') as unknown;
    if (Array.isArray(v)) return v.filter((c): c is ColumnId => COLUMNS.includes(c as ColumnId));
  } catch {
    /* повреждённое значение — берём по умолчанию */
  }
  return ['done']; // на телефоне «Готово» по умолчанию свёрнуто
}

/** Сначала — что под указателем (карточка или столбец), иначе ближайшие углы (клавиатура, края). */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : closestCorners(args);
};

type Pending = { taskId: string; from: ColumnId; snapshot: BoardSnapshot };

const WIDE = '(min-width: 1280px)';
/** Отступы ряда столбцов (lg:p-6) и промежутки между ними (gap-3) — как в разметке ниже. */
const ROW_PAD = 24 * 2;
const ROW_GAPS = 12 * (COLUMNS.length - 1);
const MIN_COLUMN = 200;

/**
 * Ширина столбца на широком экране — от ширины окна: открытый чат лежит поверх доски,
 * столбцы не сужаются и не «плывут».
 * Пересчёт — при изменении окна или левого края доски (свернули боковое меню).
 */
function useStableColumnWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof window.matchMedia !== 'function') return;
    const calc = () => {
      if (!window.matchMedia(WIDE).matches) return setWidth(null);
      const left = el.getBoundingClientRect().left;
      const free = document.documentElement.clientWidth - left - ROW_PAD - ROW_GAPS;
      setWidth(Math.max(MIN_COLUMN, Math.floor(free / COLUMNS.length)));
    };
    calc();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(calc) : null;
    ro?.observe(el);
    window.addEventListener('resize', calc);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', calc);
    };
  }, []);
  return { ref, width };
}

/**
 * Доска из 5 столбцов (ТЗ, п. 3).
 * Desktop — в ряд слева направо; mobile (< 768 px) — сворачиваемые секции сверху вниз.
 * Перетаскивание назад = «доработать»: открывается диалог, отмена возвращает карточку на место.
 */
export function BoardColumns({ sectionId }: { sectionId: string }) {
  const tasks = useBoard((s) => s.tasks);
  const order = useBoard((s) => s.order);
  const store = useBoard.getState;

  const [collapsed, setCollapsed] = useState<ColumnId[]>(readCollapsed);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  /** Столбец, открытый «Показать все» на всю доску. */
  const [fullColumn, setFullColumn] = useState<ColumnId | null>(null);
  const dragOrigin = useRef<{ from: ColumnId; snapshot: BoardSnapshot } | null>(null);
  const stable = useStableColumnWidth();

  const snap = useMemo(() => ({ tasks, order }), [tasks, order]);
  const columns = useMemo(
    () =>
      Object.fromEntries(COLUMNS.map((c) => [c, selectColumn(snap, sectionId, c)])) as Record<
        ColumnId,
        Task[]
      >,
    [snap, sectionId],
  );
  const scheduled = useMemo(() => selectScheduled(snap, sectionId), [snap, sectionId]);
  const activeTask = activeId ? tasks[activeId] : undefined;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const toggle = useCallback((c: ColumnId) => {
    setCollapsed((prev) => {
      const next = prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c];
      safeStorage.set(COLLAPSE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const navigate = useNavigate();

  /**
   * Что значит ручной перенос вперёд (карточка уже стоит в новом столбце):
   * из Черновика — отправить ИИ; в Готово — принять; в Черновик — остановить.
   */
  const afterManualMove = useCallback(
    (id: string, from: ColumnId) => {
      const to = store().tasks[id]?.column;
      if (!to || to === from) return;
      if (to === 'done') return void agent.accept(id);
      if (to === 'draft') {
        agent.stop(id);
        store().placeTask(id, 'draft', 0);
        return store().settleTask(id, from);
      }
      if (from === 'draft') return void agent.start(id);
      store().settleTask(id, from);
    },
    [store],
  );

  /** Перемещение из меню / кнопок. Назад — через диалог «Что доработать?». */
  const moveWithRework = useCallback(
    (id: string, to: ColumnId) => {
      const task = store().tasks[id];
      if (!task || task.column === to) return;
      if (isBackwardMove(task.column, to) && to !== 'draft') {
        const snapshot = store().snapshot();
        store().placeTask(id, to, 0, sectionId);
        setPending({ taskId: id, from: task.column, snapshot });
        return;
      }
      const from = task.column;
      store().placeTask(id, to, 0, sectionId);
      afterManualMove(id, from);
    },
    [store, afterManualMove, sectionId],
  );

  const actionsFor = useCallback(
    (task: Task): CardActions => ({
      onOpen: () => navigate(`/s/${sectionId}/t/${task.id}`),
      onMove: (to) => moveWithRework(task.id, to),
      onSend: () => void agent.start(task.id),
      onAnswer: (text) => void agent.reply(task.id, text),
      onApprovePlan: () => void agent.approvePlan(task.id),
      onAccept: () => void agent.accept(task.id),
      onRework: () => moveWithRework(task.id, 'working'),
      onRetry: () => void agent.retry(task.id),
      onUnschedule: () => store().unschedule(task.id),
      onStepDone: () => void agent.stepDone(task.id),
      onStepFail: () => void agent.notSolved(task.id),
      onSolved: () => void agent.solved(task.id),
      onNotSolved: () => void agent.notSolved(task.id),
    }),
    [moveWithRework, store, navigate, sectionId],
  );

  // ——— drag-and-drop ———

  const onDragStart = ({ active }: DragStartEvent) => {
    const task = store().tasks[String(active.id)];
    if (!task) return;
    dragOrigin.current = { from: task.column, snapshot: store().snapshot() };
    setActiveId(task.id);
  };

  /** Карточка «переезжает» в другой столбец ещё во время перетаскивания — так видно, куда она встанет. */
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const id = String(active.id);
    const task = store().tasks[id];
    if (!task) return;
    const overId = String(over.id);
    const overColumn = columnFromDropId(overId) ?? store().tasks[overId]?.column ?? null;
    if (!overColumn || overColumn === task.column) return;

    const list = selectColumn(store(), sectionId, overColumn);
    let index = list.length;
    const overIndex = list.findIndex((t) => t.id === overId);
    if (overIndex >= 0) {
      const translated = active.rect.current.translated;
      const below = translated ? translated.top > over.rect.top + over.rect.height / 2 : false;
      index = overIndex + (below ? 1 : 0);
    }
    store().placeTask(id, overColumn, index, sectionId);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const origin = dragOrigin.current;
    dragOrigin.current = null;
    setActiveId(null);
    const id = String(active.id);
    const task = store().tasks[id];
    if (!origin || !task) return;

    if (!over) {
      store().restore(origin.snapshot);
      return;
    }

    // Сортировка внутри столбца
    const overId = String(over.id);
    const list = selectColumn(store(), sectionId, task.column);
    const from = list.findIndex((t) => t.id === id);
    const to = list.findIndex((t) => t.id === overId);
    if (from >= 0 && to >= 0 && from !== to) {
      const ids = arrayMove(list, from, to).map((t) => t.id);
      store().placeTask(id, task.column, ids.indexOf(id), sectionId);
    }

    const finalColumn = store().tasks[id]?.column ?? task.column;
    if (finalColumn === origin.from) return;
    if (isBackwardMove(origin.from, finalColumn) && finalColumn !== 'draft') {
      setPending({ taskId: id, from: origin.from, snapshot: origin.snapshot });
      return;
    }
    afterManualMove(id, origin.from);
  };

  const onDragCancel = () => {
    if (dragOrigin.current) store().restore(dragOrigin.current.snapshot);
    dragOrigin.current = null;
    setActiveId(null);
  };

  const title = (id: string | number) => store().tasks[String(id)]?.title ?? 'карточка';
  const where = (id: string | number) => {
    const c = columnFromDropId(String(id)) ?? store().tasks[String(id)]?.column;
    return c ? COLUMN_LABELS[c] : '';
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Взята карточка «${title(active.id)}».`,
    onDragOver: ({ active, over }) =>
      over
        ? `Карточка «${title(active.id)}» над столбцом «${where(over.id)}».`
        : 'Карточка вне доски.',
    onDragEnd: ({ active, over }) =>
      over
        ? `Карточка «${title(active.id)}» перемещена в «${where(over.id)}».`
        : 'Перемещение отменено.',
    onDragCancel: ({ active }) => `Перемещение карточки «${title(active.id)}» отменено.`,
  };

  const pendingTask = pending ? tasks[pending.taskId] : undefined;

  return (
    <SectionView.Provider value={sectionId}>
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              'Чтобы взять карточку, нажмите пробел или Enter. Стрелками выберите место, ещё раз пробел — отпустить, Escape — отменить.',
          },
        }}
      >
        {fullColumn ? (
          <ColumnFullView
            column={fullColumn}
            tasks={fullColumn === 'draft' ? [...columns.draft, ...scheduled] : columns[fullColumn]}
            actionsFor={actionsFor}
            onClose={() => setFullColumn(null)}
          />
        ) : (
          <LayoutGroup>
            <div
              ref={stable.ref}
              className={cn(
                'scroll-paper md:h-full md:snap-x md:snap-mandatory md:scroll-px-4 md:overflow-auto lg:scroll-px-6',
              )}
            >
              <div
                className={cn(
                  'flex flex-col gap-3 p-3 sm:p-4 md:min-h-full md:w-max md:flex-row md:items-stretch lg:p-6',
                  stable.width === null && 'xl:w-auto',
                )}
              >
                {COLUMNS.map((c) => (
                  <Column
                    key={c}
                    column={c}
                    tasks={columns[c]}
                    scheduled={c === 'draft' ? scheduled : undefined}
                    onCreate={
                      c === 'draft'
                        ? (text, send) => {
                            const id = store().createTask(text, sectionId);
                            if (send) void agent.start(id);
                          }
                        : undefined
                    }
                    actionsFor={actionsFor}
                    collapsed={collapsed.includes(c)}
                    onToggle={() => toggle(c)}
                    onShowAll={() => setFullColumn(c)}
                    boardDragging={activeId !== null}
                    width={stable.width}
                  />
                ))}
              </div>
            </div>
          </LayoutGroup>
        )}

        {createPortal(
          <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' }}>
            {activeTask ? <TaskCard task={activeTask} overlay /> : null}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>

      <ReworkDialog
        task={pendingTask}
        from={pending?.from}
        onCancel={() => {
          if (pending) store().restore(pending.snapshot);
          setPending(null);
        }}
        onConfirm={(note) => {
          if (pending) void agent.rework(pending.taskId, note);
          setPending(null);
        }}
      />
    </SectionView.Provider>
  );
}
