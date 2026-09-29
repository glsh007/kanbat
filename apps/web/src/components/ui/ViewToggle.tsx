import { Kanban, List } from 'lucide-react';
import type { ViewMode } from '@/features/board/store';
import { Segmented, type SegmentedOption } from './Segmented';

const OPTIONS: SegmentedOption<ViewMode>[] = [
  { id: 'list', label: 'Список', icon: List, title: 'Список обращений и чат' },
  {
    id: 'board',
    label: 'Доска',
    icon: Kanban,
    title: 'Канбан-доска: все этапы обращений столбцами',
  },
];

/** Переключатель вида пользователя: список обращений с чатом или канбан-доска (для продвинутых). */
export function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return <Segmented value={value} onChange={onChange} options={OPTIONS} label="Вид" />;
}
