import { COLUMNS, type ColumnId, type Message, type Section, type Task } from '@app/shared';

/** То, что хранится на сервере и может разойтись между окнами одного человека. */
export type BoardPart = {
  tasks: Record<string, Task>;
  order: Record<ColumnId, string[]>;
  messages: Record<string, Message[]>;
  sections: Section[];
  /** Метки удаления (из любого окна) — удалённое не возвращается при слиянии. */
  tombstones: { tasks: string[]; sections: string[] };
};

const TOMBSTONES_MAX = 300;
const union = (a: string[] = [], b: string[] = []) =>
  [...new Set([...a, ...b])].slice(-TOMBSTONES_MAX);

/**
 * Слияние доски этого окна с версией с сервера (другое окно, телефон): ничего не теряем.
 * Задачи — объединение, при расхождении побеждает более свежая (`updatedAt`);
 * переписка — объединение по id сообщений; порядок — сначала свой, затем новые чужие;
 * разделы — объединение. Удалённое в любом окне (метки удаления) не возвращается.
 */
export function mergeBoards(local: BoardPart, remote: Partial<BoardPart>): BoardPart {
  const tombstones = {
    tasks: union(local.tombstones.tasks, remote.tombstones?.tasks),
    sections: union(local.tombstones.sections, remote.tombstones?.sections),
  };
  const deadTasks = new Set(tombstones.tasks);
  const deadSections = new Set(tombstones.sections);
  const tasks: Record<string, Task> = {};
  const ids = new Set([...Object.keys(local.tasks), ...Object.keys(remote.tasks ?? {})]);
  for (const id of ids) {
    if (deadTasks.has(id)) continue;
    const mine = local.tasks[id];
    const theirs = remote.tasks?.[id];
    if (mine && theirs) tasks[id] = theirs.updatedAt > mine.updatedAt ? theirs : mine;
    else tasks[id] = (mine ?? theirs)!;
  }

  const messages: Record<string, Message[]> = {};
  for (const id of Object.keys(tasks)) {
    const byId = new Map<string, Message>();
    for (const m of remote.messages?.[id] ?? []) byId.set(m.id, m);
    for (const m of local.messages[id] ?? []) byId.set(m.id, m);
    const list = [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (list.length) messages[id] = list;
  }

  const order = {} as Record<ColumnId, string[]>;
  const placed = new Set<string>();
  for (const c of COLUMNS) {
    const list: string[] = [];
    for (const id of [...(local.order[c] ?? []), ...(remote.order?.[c] ?? [])])
      if (tasks[id]?.column === c && !placed.has(id)) {
        list.push(id);
        placed.add(id);
      }
    order[c] = list;
  }
  // задачи, которых нет ни в одном порядке (на всякий случай), — в начало своего столбца
  for (const [id, t] of Object.entries(tasks)) if (!placed.has(id)) order[t.column].unshift(id);

  const sections = local.sections.filter((x) => !deadSections.has(x.id));
  for (const s of remote.sections ?? [])
    if (!deadSections.has(s.id) && !sections.some((x) => x.id === s.id)) sections.push(s);

  return { tasks, order, messages, sections, tombstones };
}

/** Совпадают ли доски по содержанию (порядок ключей объектов не важен). */
export function sameBoard(a: BoardPart, b: Partial<BoardPart>): boolean {
  const keys = (o: object | undefined) => Object.keys(o ?? {}).sort();
  const ta = keys(a.tasks);
  if (JSON.stringify(ta) !== JSON.stringify(keys(b.tasks))) return false;
  for (const id of ta) {
    if (JSON.stringify(a.tasks[id]) !== JSON.stringify(b.tasks?.[id])) return false;
    const ma = a.messages[id] ?? [];
    const mb = b.messages?.[id] ?? [];
    if (ma.length !== mb.length || ma.at(-1)?.id !== mb.at(-1)?.id) return false;
  }
  for (const c of COLUMNS)
    if (JSON.stringify(a.order[c] ?? []) !== JSON.stringify(b.order?.[c] ?? [])) return false;
  if (a.tombstones.tasks.length !== (b.tombstones?.tasks.length ?? 0)) return false;
  if (a.tombstones.sections.length !== (b.tombstones?.sections.length ?? 0)) return false;
  return JSON.stringify(a.sections) === JSON.stringify(b.sections ?? []);
}
