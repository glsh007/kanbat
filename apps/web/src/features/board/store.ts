import {
  COLUMNS,
  GENERAL_SECTION_ID,
  isBackwardMove,
  SECTION_COLORS,
  type ColumnId,
  type Message,
  type Section,
  type SectionColor,
  type Task,
  type SectionMode,
} from '@app/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useUserRole } from '@/lib/session';
import { baseSections, createDemoBoard, demoSections } from './demo';
import { serverStorage } from './serverStorage';

/**
 * Порядок карточек в «Общем»: столбец → id задач сверху вниз.
 * Разделы — подборки из «Общего» по смыслу, поэтому порядок один на все доски.
 */
export type BoardOrder = Record<ColumnId, string[]>;

export type BoardSnapshot = { tasks: Record<string, Task>; order: BoardOrder };

export type BoardData = BoardSnapshot & { messages: Record<string, Message[]> };

export type SectionDraft = {
  name: string;
  description: string;
  color: SectionColor;
  mode: SectionMode;
};

/** Роль в демо: сотрудник видит свои обращения, специалист — ещё и доску специалиста. */
export type Role = 'employee' | 'specialist';

/** Вид экрана сотрудника: список обращений с чатом (по умолчанию) или канбан-доска. */
export type ViewMode = 'list' | 'board';

export type Settings = {
  view?: ViewMode;
  /** Лёгкие чёткие задачи (тип A) сами уходят в «Готово», минуя остановку в «Проверке». */
  autoAccept: boolean;
  /** Модель Ollama, выбранная пользователем (null — сервер выберет сам). */
  model: string | null;
};

/** Текст, который модель печатает прямо сейчас (не сохраняется). */
export type LiveReply = { text: string; model: string | null };

/**
 * Метки удаления: что человек удалил. Хранятся вместе с доской, чтобы при слиянии версий
 * из разных окон (телефон и ноутбук) удалённое не вернулось из «старого» окна.
 */
export type Tombstones = { tasks: string[]; sections: string[] };
const TOMBSTONES_MAX = 300;
const bury = (list: string[], ids: string[]) => [...list, ...ids].slice(-TOMBSTONES_MAX);

type BoardState = BoardData & {
  sections: Section[];
  settings: Settings;
  tombstones: Tombstones;
  live: Record<string, LiveReply>;
  /** Разделы, по которым ИИ сейчас раскладывает задачи (не сохраняется). */
  sorting: Record<string, boolean>;

  /** Новая задача — всегда в «Общем»; если создана внутри раздела — сразу и в нём. */
  createTask: (text: string, sectionId?: string) => string;
  patchTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  /**
   * Позиционное перемещение без смены статуса (перетаскивание, автодвижение).
   * `view` — раздел, на доске которого двигают: index считается среди его карточек.
   */
  placeTask: (id: string, to: ColumnId, index?: number, view?: string) => void;
  /** Ручное перемещение: ставит карточку и приводит статус в соответствие со столбцом. */
  moveTask: (id: string, to: ColumnId, index?: number, view?: string) => void;
  settleTask: (id: string, from: ColumnId) => void;
  unschedule: (id: string) => void;

  /** id можно задать (ответы специалиста с сервера — чтобы не добавить дважды). */
  addMessage: (
    taskId: string,
    msg: Omit<Message, 'id' | 'taskId' | 'createdAt'> & { id?: string },
  ) => string;
  removeMessage: (taskId: string, messageId: string) => void;
  setLive: (taskId: string, live: LiveReply | null) => void;
  setSettings: (patch: Partial<Settings>) => void;

  // разделы
  addSection: (draft: SectionDraft) => string;
  updateSection: (id: string, patch: Partial<SectionDraft>) => void;
  /** Удалить раздел: задачи остаются в «Общем». */
  deleteSection: (id: string) => void;
  /** Вручную добавить задачу в раздел или убрать из него (убранную ИИ больше не добавит). */
  setTaskSection: (taskId: string, sectionId: string, on: boolean) => void;
  /** Раскладка от ИИ: только добавляет, не трогая разделы, откуда задачу убрали вручную. */
  applySort: (assign: Record<string, string[]>) => void;
  setSorting: (sectionId: string, on: boolean) => void;

  snapshot: () => BoardSnapshot;
  restore: (s: BoardSnapshot) => void;
  resetDemo: () => void;
  /** Добавить примеры обращений к своим, ничего не удаляя (пустой кабинет, «Настройки»). */
  addDemo: () => void;
};

const emptyColumns = (): Record<ColumnId, string[]> => ({
  draft: [],
  clarify: [],
  working: [],
  review: [],
  done: [],
});

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

const now = () => new Date().toISOString();

/** Видна ли задача на доске раздела. */
export function inSection(task: Task, sectionId: string): boolean {
  return sectionId === GENERAL_SECTION_ID || task.sections.includes(sectionId);
}

/**
 * Переставить карточку в общем порядке. Если двигают на доске раздела, `index` — место среди
 * карточек этого раздела: карточка встаёт перед той, что там сейчас, или сразу после последней.
 */
function reposition(
  order: BoardOrder,
  tasks: Record<string, Task>,
  id: string,
  to: ColumnId,
  index?: number,
  view: string = GENERAL_SECTION_ID,
): BoardOrder {
  const next = { ...emptyColumns(), ...order };
  for (const c of COLUMNS) {
    if (next[c].includes(id)) next[c] = next[c].filter((x) => x !== id);
  }
  const target = [...next[to]];
  let at = 0;
  if (index !== undefined) {
    const visible = target.filter((x) => {
      const t = tasks[x];
      return !!t && t.status !== 'scheduled' && inSection(t, view);
    });
    const i = Math.max(0, Math.min(index, visible.length));
    if (i < visible.length) at = target.indexOf(visible[i]!);
    else
      at = visible.length
        ? target.indexOf(visible.at(-1)!) + 1
        : view === GENERAL_SECTION_ID
          ? target.length
          : 0;
  }
  target.splice(at, 0, id);
  next[to] = target;
  return next;
}

/** Статус при ручном переносе. Запуск ИИ, «Принять» и доработку делает agent.ts. */
function statusFor(from: ColumnId, to: ColumnId): Partial<Task> {
  const clear = { pendingQuestions: 0, errorMessage: null, checkpoint: null } as const;
  if (to === 'done' || to === 'draft') return { status: 'idle', ...clear };
  // назад — статус задаст доработка; вперёд в середину доски — оставляем как есть
  if (isBackwardMove(from, to)) return {};
  return {};
}

/** Пустая задача с полями по умолчанию. */
export function blankTask(id: string, sections: string[], title: string): Task {
  return {
    id,
    sections,
    hiddenFrom: [],
    title,
    structure: 'clear',
    difficulty: 'easy',
    column: 'draft',
    status: 'idle',
    scheduledAt: null,
    recipient: 'ai',
    pendingQuestions: 0,
    plan: null,
    preview: null,
    errorMessage: null,
    checkpoint: null,
    questions: null,
    lastStep: null,
    estimatedSeconds: null,
    titleEdited: false,
    triage: null,
    urgency: 'normal',
    stepIndex: 0,
    attempts: 0,
    escalation: null,
    createdAt: now(),
    updatedAt: now(),
  };
}

// ——— Миграция v3 → v4: у каждого раздела была своя доска, теперь всё в «Общем» ———

type V3 = {
  tasks?: Record<string, Omit<Task, 'sections' | 'hiddenFrom'> & { sectionId?: string }>;
  order?: Record<string, Record<ColumnId, string[]>>;
  messages?: Record<string, Message[]>;
  settings?: Settings;
};

/** Старые демо-разделы получили понятные id. */
const V3_IDS: Record<string, string> = { work: 'access', study: 'hardware' };

function migrateV3(old: V3) {
  const sections = demoSections();
  const known = new Set(sections.map((x) => x.id));
  const tasks: Record<string, Task> = {};
  for (const [id, t] of Object.entries(old.tasks ?? {})) {
    const { sectionId, ...rest } = t;
    const sec = sectionId ? (V3_IDS[sectionId] ?? sectionId) : GENERAL_SECTION_ID;
    tasks[id] = {
      ...rest,
      sections: sec !== GENERAL_SECTION_ID && known.has(sec) ? [sec] : [],
      hiddenFrom: [],
    };
  }
  const order = emptyColumns();
  const boards = Object.entries(old.order ?? {}).sort(([a], [b]) =>
    a === GENERAL_SECTION_ID ? -1 : b === GENERAL_SECTION_ID ? 1 : 0,
  );
  for (const [, cols] of boards)
    for (const c of COLUMNS) for (const id of cols?.[c] ?? []) if (tasks[id]) order[c].push(id);
  return {
    tasks,
    order,
    messages: old.messages ?? {},
    sections,
    settings: old.settings ?? { autoAccept: true, model: null },
  };
}

/** Текущий вид экрана сотрудника. */
export const useViewMode = (): ViewMode => useBoard((s) => s.settings.view ?? 'list');

/** Роль вошедшего пользователя (выдаёт сервер при входе). */
export const useRole = (): Role => useUserRole() ?? 'employee';

/** Пустой личный кабинет: только «Общее», без обращений (примеры — по кнопке). */
const emptyBoard = (): BoardData => ({ tasks: {}, order: emptyColumns(), messages: {} });

/** Чистая доска для только что вошедшего пользователя — до загрузки с сервера. */
export function resetBoardForLogin() {
  useBoard.setState({
    ...emptyBoard(),
    sections: baseSections(),
    settings: { autoAccept: true, model: null },
    tombstones: { tasks: [], sections: [] },
    live: {},
    sorting: {},
  });
}

export const useBoard = create<BoardState>()(
  persist(
    (set, get) => ({
      ...emptyBoard(),
      sections: baseSections(),
      settings: { autoAccept: true, model: null },
      tombstones: { tasks: [], sections: [] },
      live: {},
      sorting: {},

      createTask: (text, sectionId) => {
        const id = newId();
        const clean = text.trim().replace(/\s+/g, ' ');
        const title = clean.length > 90 ? `${clean.slice(0, 87)}…` : clean;
        const here = sectionId && sectionId !== GENERAL_SECTION_ID ? [sectionId] : [];
        const task = blankTask(id, here, title);
        const first: Message = {
          id: newId(),
          taskId: id,
          role: 'user',
          content: text.trim(),
          createdAt: now(),
        };
        set((s) => ({
          tasks: { ...s.tasks, [id]: task },
          order: reposition(s.order, s.tasks, id, 'draft', 0),
          messages: { ...s.messages, [id]: [first] },
        }));
        return id;
      },

      patchTask: (id, patch) =>
        set((s) => {
          const task = s.tasks[id];
          if (!task) return s;
          return { tasks: { ...s.tasks, [id]: { ...task, ...patch, updatedAt: now() } } };
        }),

      deleteTask: (id) =>
        set((s) => {
          const task = s.tasks[id];
          if (!task) return s;
          const tasks = { ...s.tasks };
          delete tasks[id];
          const messages = { ...s.messages };
          delete messages[id];
          const order = Object.fromEntries(
            COLUMNS.map((c) => [c, (s.order[c] ?? []).filter((x) => x !== id)]),
          ) as BoardOrder;
          const tombstones = { ...s.tombstones, tasks: bury(s.tombstones.tasks, [id]) };
          return { tasks, messages, order, tombstones };
        }),

      placeTask: (id, to, index, view) =>
        set((s) => {
          const task = s.tasks[id];
          if (!task) return s;
          return {
            order: reposition(s.order, s.tasks, id, to, index, view),
            tasks: { ...s.tasks, [id]: { ...task, column: to } },
          };
        }),

      moveTask: (id, to, index, view) => {
        const task = get().tasks[id];
        if (!task) return;
        const from = task.column;
        get().placeTask(id, to, index, view);
        if (from !== to) get().settleTask(id, from);
      },

      settleTask: (id, from) =>
        set((s) => {
          const task = s.tasks[id];
          if (!task || task.column === from) return s;
          return {
            tasks: {
              ...s.tasks,
              [id]: { ...task, ...statusFor(from, task.column), updatedAt: now() },
            },
          };
        }),

      unschedule: (id) =>
        set((s) => {
          const task = s.tasks[id];
          if (!task) return s;
          return {
            tasks: {
              ...s.tasks,
              [id]: { ...task, status: 'idle', scheduledAt: null, updatedAt: now() },
            },
            order: reposition(s.order, s.tasks, id, 'draft', 0),
          };
        }),

      addMessage: (taskId, msg) => {
        const id = msg.id ?? newId();
        set((s) => ({
          messages: {
            ...s.messages,
            [taskId]: [...(s.messages[taskId] ?? []), { ...msg, id, taskId, createdAt: now() }],
          },
        }));
        return id;
      },

      removeMessage: (taskId, messageId) =>
        set((s) => ({
          messages: {
            ...s.messages,
            [taskId]: (s.messages[taskId] ?? []).filter((m) => m.id !== messageId),
          },
        })),

      setLive: (taskId, live) =>
        set((s) => {
          const next = { ...s.live };
          if (live) next[taskId] = live;
          else delete next[taskId];
          return { live: next };
        }),

      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      addSection: (draft) => {
        const id = `s-${newId().slice(0, 8)}`;
        set((s) => ({
          sections: [
            ...s.sections,
            {
              id,
              name: draft.name.trim(),
              description: draft.description.trim() || undefined,
              color: draft.color,
              sharedContext: false,
              mode: draft.mode,
            },
          ],
        }));
        return id;
      },

      updateSection: (id, patch) =>
        set((s) => ({
          sections: s.sections.map((x) =>
            x.id !== id || x.id === GENERAL_SECTION_ID
              ? x
              : {
                  ...x,
                  ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
                  ...(patch.description !== undefined
                    ? { description: patch.description.trim() || undefined }
                    : {}),
                  ...(patch.color ? { color: patch.color } : {}),
                  ...(patch.mode ? { mode: patch.mode } : {}),
                },
          ),
        })),

      deleteSection: (id) =>
        set((s) => {
          if (id === GENERAL_SECTION_ID) return s;
          const tasks: Record<string, Task> = {};
          for (const [k, t] of Object.entries(s.tasks))
            tasks[k] =
              t.sections.includes(id) || t.hiddenFrom.includes(id)
                ? {
                    ...t,
                    sections: t.sections.filter((x) => x !== id),
                    hiddenFrom: t.hiddenFrom.filter((x) => x !== id),
                  }
                : t;
          const sorting = { ...s.sorting };
          delete sorting[id];
          const tombstones = { ...s.tombstones, sections: bury(s.tombstones.sections, [id]) };
          return { sections: s.sections.filter((x) => x.id !== id), tasks, sorting, tombstones };
        }),

      setTaskSection: (taskId, sectionId, on) =>
        set((s) => {
          const t = s.tasks[taskId];
          if (!t || sectionId === GENERAL_SECTION_ID) return s;
          const sections = on
            ? [...new Set([...t.sections, sectionId])]
            : t.sections.filter((x) => x !== sectionId);
          const hiddenFrom = on
            ? t.hiddenFrom.filter((x) => x !== sectionId)
            : [...new Set([...t.hiddenFrom, sectionId])];
          return { tasks: { ...s.tasks, [taskId]: { ...t, sections, hiddenFrom } } };
        }),

      applySort: (assign) =>
        set((s) => {
          const known = new Set(s.sections.map((x) => x.id));
          let changed = false;
          const tasks = { ...s.tasks };
          for (const [id, ids] of Object.entries(assign)) {
            const t = tasks[id];
            if (!t) continue;
            const add = ids.filter(
              (x) =>
                known.has(x) &&
                x !== GENERAL_SECTION_ID &&
                !t.sections.includes(x) &&
                !t.hiddenFrom.includes(x),
            );
            if (!add.length) continue;
            tasks[id] = { ...t, sections: [...t.sections, ...add] };
            changed = true;
          }
          return changed ? { tasks } : s;
        }),

      setSorting: (sectionId, on) =>
        set((s) => {
          const sorting = { ...s.sorting };
          if (on) sorting[sectionId] = true;
          else delete sorting[sectionId];
          return { sorting };
        }),

      snapshot: () => ({ tasks: get().tasks, order: get().order }),
      restore: (snap) => set(snap),
      addDemo: () =>
        set((s) => {
          const demo = createDemoBoard();
          const order = Object.fromEntries(
            COLUMNS.map((c) => [c, [...demo.order[c], ...(s.order[c] ?? [])]]),
          ) as BoardOrder;
          const have = new Set(s.sections.map((x) => x.id));
          const extra = demoSections().filter((x) => !have.has(x.id));
          // разделы примеров, удалённые раньше, возвращаются осознанно — снимаем их метки удаления
          const revived = new Set(extra.map((x) => x.id));
          return {
            tasks: { ...s.tasks, ...demo.tasks },
            messages: { ...s.messages, ...demo.messages },
            order,
            sections: [...s.sections, ...extra],
            tombstones: {
              ...s.tombstones,
              sections: s.tombstones.sections.filter((id) => !revived.has(id)),
            },
          };
        }),

      resetDemo: () => {
        // прежние задачи удалены намеренно — слияние с другим окном их не вернёт
        const t = get().tombstones;
        set({
          ...createDemoBoard(),
          sections: demoSections(),
          live: {},
          sorting: {},
          tombstones: { tasks: bury(t.tasks, Object.keys(get().tasks)), sections: t.sections },
        });
      },
    }),
    {
      name: 'kc-board',
      version: 4,
      // доска хранится на сервере; загружается после входа (BoardGate)
      storage: createJSONStorage(() => serverStorage),
      skipHydration: true,
      partialize: (s) => ({
        tasks: s.tasks,
        order: s.order,
        messages: s.messages,
        sections: s.sections,
        settings: s.settings,
        tombstones: s.tombstones,
      }),
      migrate: (persisted, version) => {
        // старые версии без полей ИИ/поддержки — начинаем с чистых демо-данных
        if (version < 3)
          return {
            ...createDemoBoard(),
            sections: demoSections(),
            settings: { autoAccept: true, model: null },
          } as unknown as BoardState;
        if (version < 4) return migrateV3(persisted as V3) as unknown as BoardState;
        return persisted as BoardState;
      },
    },
  ),
);

/** Задачи столбца на доске раздела (без запланированных — у них своя подзона). */
export function selectColumn(s: BoardSnapshot, sectionId: string, column: ColumnId): Task[] {
  const ids = s.order[column] ?? [];
  return ids
    .map((id) => s.tasks[id])
    .filter((t): t is Task => !!t && t.status !== 'scheduled' && inSection(t, sectionId));
}

export function selectScheduled(s: BoardSnapshot, sectionId: string): Task[] {
  return Object.values(s.tasks)
    .filter((t) => t.status === 'scheduled' && inSection(t, sectionId))
    .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''));
}

export function countActive(tasks: Record<string, Task>, sectionId: string): number {
  let n = 0;
  for (const t of Object.values(tasks)) if (inSection(t, sectionId) && t.column !== 'done') n++;
  return n;
}

/** Раздел по id (undefined — нет такого, например удалён). */
export const useSection = (id: string | undefined): Section | undefined =>
  useBoard((s) => s.sections.find((x) => x.id === id));

/** Пользовательские разделы (без «Общего»). */
export const userSections = (sections: Section[]) =>
  sections.filter((x) => x.id !== GENERAL_SECTION_ID);

export const nextSectionColor = (sections: Section[]): SectionColor =>
  SECTION_COLORS[sections.length % SECTION_COLORS.length]!;
