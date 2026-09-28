import { GENERAL_SECTION_ID, type Section, type Task } from '@app/shared';
import { FolderMinus } from 'lucide-react';
import type { MenuItem } from '@/components/ui/Menu';
import { useBoard, userSections } from './store';

/**
 * Пункты меню «Разделы» для карточки и окна задачи: отметка — задача видна в разделе.
 * Снятая отметка = «убрать из раздела»: задача остаётся в «Общем», и ИИ её туда больше не вернёт.
 */
export function sectionMenuItems(task: Task, sections: Section[], view: string): MenuItem[] {
  const own = userSections(sections);
  if (!own.length) return [];
  const toggle = (id: string, on: boolean) => useBoard.getState().setTaskSection(task.id, id, on);
  const current = view !== GENERAL_SECTION_ID ? own.find((s) => s.id === view) : undefined;
  return [
    { kind: 'separator', id: 'sec-sep' },
    ...(current && task.sections.includes(current.id)
      ? [
          {
            id: 'sec-remove',
            label: `Убрать из «${current.name}»`,
            icon: <FolderMinus size={16} />,
            onSelect: () => toggle(current.id, false),
          } as MenuItem,
        ]
      : []),
    { kind: 'label', id: 'sec-label', label: 'Показывать в разделах' },
    ...own.map((s): MenuItem => ({
      id: `sec-${s.id}`,
      label: s.name,
      checked: task.sections.includes(s.id),
      multi: true,
      onSelect: () => toggle(s.id, !task.sections.includes(s.id)),
    })),
  ];
}
