import { COLUMN_LABELS, type Task } from '@app/shared';

/** Что сейчас с обращением — одной короткой фразой. */
export function statusText(t: Task): string {
  if (t.status === 'awaiting_user') return 'Нужен ваш ответ';
  if (t.status === 'error') return 'Не получилось — откройте';
  if (t.status === 'awaiting_ai') return 'Помощник отвечает…';
  if (t.status === 'with_support') return 'У специалиста';
  if (t.status === 'scheduled') return 'Запланировано';
  if (t.column === 'done') return t.selfSolved ? 'Решено самостоятельно' : 'Решено';
  return COLUMN_LABELS[t.column];
}
