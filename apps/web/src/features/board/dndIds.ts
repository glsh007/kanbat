import { COLUMNS, type ColumnId } from '@app/shared';

/** id зоны сброса столбца в dnd-kit (id карточек — это id задач). */
export const columnDropId = (c: ColumnId) => `col:${c}`;

export const columnFromDropId = (id: string): ColumnId | null => {
  const c = id.startsWith('col:') ? id.slice(4) : null;
  return c && COLUMNS.includes(c as ColumnId) ? (c as ColumnId) : null;
};
