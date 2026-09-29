import {
  canMoveManually,
  moveLabel,
  COLUMN_LABELS,
  COLUMNS,
  GENERAL_SECTION_ID,
  taskKind,
  type ColumnId,
  type Task,
} from '@app/shared';
import {
  ArrowLeft,
  Flag,
  Headset,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { UrgentMark } from '@/components/ui/UrgentMark';
import { useEffect, useId, useRef, useState } from 'react';
import { IconButton } from '@/components/ui/IconButton';
import { NavArrows } from '@/layout/NavArrows';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { TaskTypeBadge } from '@/components/ui/TaskTypeBadge';
import { fieldClass } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import { StageTrack } from '@/components/ui/StageTrack';
import { useParams } from 'react-router';
import { SectionChips } from '@/features/board/SectionChips';
import { sectionMenuItems } from '@/features/board/sectionMenu';
import { useBoard } from '@/features/board/store';

type Props = {
  task: Task;
  fullscreen: boolean;
  /** Нет — кнопки «на весь экран» нет (окно и так основное). */
  onToggleFullscreen?: () => void;
  /** Подпись кнопки «назад» на телефоне. */
  backLabel?: string;
  /** Показывать тип задачи A–D (для продвинутого вида «Доска»). */
  showKind?: boolean;
  onClose: () => void;
  onRename: (title: string) => void;
  onMove: (to: ColumnId) => void;
  /** «Попросить срочно» / изменить просьбу (ТЗ v4.16). */
  onUrgent: () => void;
  onDelete: () => void;
  /** Передать специалисту (undefined — сейчас нельзя). */
  onEscalate?: () => void;
};

export function TaskHeader({
  task,
  fullscreen,
  onToggleFullscreen,
  backLabel = 'Назад к доске',
  showKind = true,
  onClose,
  onRename,
  onMove,
  onUrgent,
  onDelete,
  onEscalate,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const kind = taskKind(task.structure, task.difficulty);
  const sections = useBoard((s) => s.sections);
  const view = useParams().sectionId ?? GENERAL_SECTION_ID;

  useEffect(() => {
    if (!editing) setDraft(task.title);
  }, [task.title, editing]);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const save = () => {
    const t = draft.trim();
    if (t && t !== task.title) onRename(t);
    setEditing(false);
  };

  // Столбцы — для вида «Доска». Тип задачи (A–D) ставит ИИ, вручную не меняется (ТЗ v4.16):
  // на путь задачи он не влияет, а ручная правка лишь вводила в заблуждение.
  const boardItems: MenuItem[] = showKind
    ? [
        { kind: 'label', id: 'move', label: 'Переместить в столбец' },
        // вперёд двигает помощник; вручную — только назад или в «Готово» (ТЗ v4.23)
        ...COLUMNS.map((c): MenuItem => ({
          id: `m-${c}`,
          label: moveLabel(task.column, c),
          checked: task.column === c,
          disabled: !canMoveManually(task.column, c) || task.column === c,
          onSelect: () => onMove(c),
        })),
      ]
    : [];
  const sectionItems = sectionMenuItems(task, sections, view);
  const menu: MenuItem[] = [
    ...boardItems,
    // без доски разделитель в начале не нужен
    ...(showKind
      ? sectionItems
      : sectionItems.filter((x, i) => !(i === 0 && x.kind === 'separator'))),
    { kind: 'separator', id: 's2' },
    ...(onEscalate
      ? [
          {
            id: 'escalate',
            label: 'Передать специалисту',
            icon: <Headset size={16} />,
            onSelect: onEscalate,
          } as MenuItem,
        ]
      : []),
    {
      id: 'urgent',
      label: task.urgentRequest ? 'Просьба «Срочно»…' : 'Попросить срочно…',
      icon: <Flag size={16} />,
      onSelect: onUrgent,
    },
    { id: 'delete', label: 'Удалить задачу', icon: <Trash2 size={16} />, onSelect: onDelete },
  ];

  return (
    <header className="flex flex-col gap-2 border-b border-line bg-canvas px-2 pt-2 pb-3 sm:px-4">
      <div className="flex items-start gap-1">
        <IconButton
          label={backLabel}
          icon={<ArrowLeft size={20} />}
          onClick={onClose}
          className="lg:hidden"
        />
        <div className="min-w-0 flex-1 pt-1.5 pl-1">
          {editing ? (
            <>
              <label htmlFor={inputId} className="sr-only">
                Название задачи
              </label>
              <input
                id={inputId}
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={save}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save();
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setEditing(false);
                  }
                }}
                className={cn(fieldClass, 'h-9 text-base font-semibold')}
              />
            </>
          ) : (
            <h2 className="font-serif text-[21px] leading-snug font-medium tracking-[-0.01em]">
              <button
                type="button"
                onClick={() => setEditing(true)}
                title="Нажмите, чтобы переименовать"
                className="rounded-[6px] text-left hover:underline hover:decoration-line-strong hover:underline-offset-4"
              >
                {task.title}
              </button>
            </h2>
          )}
        </div>
        {/* на телефоне обращение — на весь экран поверх шапки: стрелки Канбата — здесь */}
        <NavArrows className="lg:hidden" />
        <Menu label="Действия с задачей" icon={<MoreHorizontal size={20} />} items={menu} />
        {/* только desktop: на телефоне окно и так на весь экран, а «Назад» — слева */}
        <div className="hidden lg:flex">
          {onToggleFullscreen && (
            <IconButton
              label={fullscreen ? 'Свернуть в панель' : 'Развернуть на весь экран'}
              icon={fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              onClick={onToggleFullscreen}
              size="sm"
            />
          )}
          <IconButton label="Закрыть" icon={<X size={20} />} onClick={onClose} size="sm" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pl-1 lg:pl-1">
        <span className="inline-flex items-center gap-1.5">
          {showKind && (
            <TaskTypeBadge structure={task.structure} difficulty={task.difficulty} showKind />
          )}
          {task.urgentRequest && <UrgentMark reason={task.urgentRequest.reason} />}
          {/* тип A–D — только в виде «Доска»; в списке скринридер не читает непонятную букву */}
          {showKind && <span className="sr-only">Тип {kind}</span>}
        </span>
        <StageTrack column={task.column} />
        <span className="text-sm text-fg-muted">
          {task.column === 'done' && task.selfSolved
            ? 'Решено самостоятельно'
            : COLUMN_LABELS[task.column]}
        </span>
      </div>
      <SectionChips task={task} sections={sections} view={GENERAL_SECTION_ID} className="pl-1" />
    </header>
  );
}
