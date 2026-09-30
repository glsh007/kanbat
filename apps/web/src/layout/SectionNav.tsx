import { GENERAL_SECTION_ID, isManualSection, type Section } from '@app/shared';
import {
  FolderPlus,
  Hand,
  ListPlus,
  LoaderCircle,
  MessageCircle,
  MessagesSquare,
  MoreHorizontal,
  Pencil,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { Logo } from '@/brand/Logo';
import { MadeBy } from '@/brand/MadeBy';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Menu } from '@/components/ui/Menu';
import { SectionDot } from '@/components/ui/SectionDot';
import { SchemeMenu } from '@/components/ui/SchemePicker';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { AiStatusLine } from '@/features/agent/AiStatusLine';
import { countActive, useBoard, type SectionDraft } from '@/features/board/store';
import { SectionDialog } from '@/features/sections/SectionDialog';
import { useAddToSection } from '@/features/sections/addStore';
import { sortSection } from '@/features/sections/sorter';
import { cn } from '@/lib/cn';
import { navItemClass } from './navItem';
import { DmBadge } from '@/features/dm/DmBadge';
import { UserCard } from './UserCard';
import { useBrandWords } from '@/brand/orgBrand';

/**
 * Меню пользователя: логотип, его разделы, Бат-Форум, тема.
 * Используется и в боковой панели (desktop), и в выдвижном листе (mobile).
 */
export function SectionNav({ onNavigate }: { onNavigate?: () => void }) {
  // названия — реактивно: администратор сменил в «Оформлении» — меню обновится сразу
  const words = useBrandWords();
  const tasks = useBoard((s) => s.tasks);
  const sections = useBoard((s) => s.sections);
  const sorting = useBoard((s) => s.sorting);
  const navigate = useNavigate();
  const location = useLocation();
  /** null — диалог закрыт; 'new' — новый раздел; иначе — изменяемый раздел. */
  const [editing, setEditing] = useState<Section | 'new' | null>(null);
  const [removing, setRemoving] = useState<Section | null>(null);

  const save = (draft: SectionDraft) => {
    const store = useBoard.getState();
    if (editing === 'new') {
      const id = store.addSection(draft);
      setEditing(null);
      navigate(`/s/${id}`);
      onNavigate?.();
      // по смыслу — ИИ раскладывает сам; вручную — сразу предлагаем выбрать обращения
      if (draft.mode === 'manual') useAddToSection.getState().open(id);
      else void sortSection(id);
      return;
    }
    if (!editing) return;
    const meaningChanged =
      editing.name !== draft.name ||
      (editing.description ?? '') !== draft.description.trim() ||
      (editing.mode ?? 'auto') !== draft.mode;
    store.updateSection(editing.id, draft);
    setEditing(null);
    if (meaningChanged && draft.mode !== 'manual') void sortSection(editing.id);
  };

  const remove = () => {
    if (!removing) return;
    useBoard.getState().deleteSection(removing.id);
    if (location.pathname.startsWith(`/s/${removing.id}`)) navigate(`/s/${GENERAL_SECTION_ID}`);
    setRemoving(null);
  };

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-2 pt-1">
        <Logo variant="full" size={28} poweredBy />
      </div>

      <nav aria-label="Разделы" className="flex min-h-0 flex-1 flex-col gap-1">
        <h2 className="px-3 pb-1 text-xs font-medium text-fg-muted">Разделы</h2>
        <ul className="scroll-paper flex flex-col gap-0.5 overflow-y-auto">
          {sections.map((s) => (
            <li key={s.id} className="group/sec relative">
              <NavLink
                to={`/s/${s.id}`}
                className={(a) => cn(navItemClass(a), s.id !== GENERAL_SECTION_ID && 'pr-11')}
                onClick={onNavigate}
              >
                <SectionDot color={s.color} />
                <span className="min-w-0 flex-1 truncate">
                  {s.name}
                  {isManualSection(s) && <span className="sr-only"> (вручную)</span>}
                </span>
                {isManualSection(s) && (
                  <span title="Раздел вручную: обращения выбираете вы" className="text-fg-muted">
                    <Hand size={13} aria-hidden />
                  </span>
                )}
                {sorting[s.id] ? (
                  <span className="inline-flex text-fg-muted" title="ИИ раскладывает задачи">
                    <LoaderCircle size={14} aria-hidden className="animate-spin" />
                    <span className="sr-only">ИИ раскладывает задачи</span>
                  </span>
                ) : (
                  <span className="text-xs text-fg-muted tabular-nums">
                    <span className="sr-only">Активных задач: </span>
                    {countActive(tasks, s.id)}
                  </span>
                )}
              </NavLink>
              {s.id !== GENERAL_SECTION_ID && (
                <div className="absolute top-1/2 right-1 -translate-y-1/2">
                  <Menu
                    label={`Раздел «${s.name}»: действия`}
                    icon={<MoreHorizontal size={18} />}
                    triggerClassName="size-9 opacity-100 md:opacity-0 md:group-hover/sec:opacity-100 md:focus-visible:opacity-100 md:aria-expanded:opacity-100"
                    items={[
                      {
                        id: 'edit',
                        label: 'Изменить',
                        icon: <Pencil size={16} />,
                        onSelect: () => setEditing(s),
                      },
                      {
                        id: 'add',
                        label: 'Добавить обращения',
                        icon: <ListPlus size={16} />,
                        onSelect: () => {
                          navigate(`/s/${s.id}`);
                          onNavigate?.();
                          useAddToSection.getState().open(s.id);
                        },
                      },
                      ...(isManualSection(s)
                        ? []
                        : [
                            {
                              id: 'resort',
                              label: 'Разложить задачи заново',
                              icon: <Sparkles size={16} />,
                              disabled: !!sorting[s.id],
                              onSelect: () => void sortSection(s.id),
                            },
                          ]),
                      { kind: 'separator', id: 'sep' },
                      {
                        id: 'delete',
                        label: 'Удалить раздел',
                        icon: <Trash2 size={16} />,
                        onSelect: () => setRemoving(s),
                      },
                    ]}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="flex h-11 items-center gap-3 rounded-control px-3 text-[15px] text-fg-muted transition-colors duration-200 hover:bg-sunken hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <FolderPlus size={18} aria-hidden />
          Новый раздел
        </button>

        <h2 className="px-3 pt-4 pb-1 text-xs font-medium text-fg-muted">Сообщество</h2>
        <NavLink to="/forum" className={navItemClass} onClick={onNavigate}>
          <MessagesSquare size={18} aria-hidden />
          <span className="min-w-0 flex-1 truncate">{words.forum}</span>
        </NavLink>
        <NavLink to="/messages" className={navItemClass} onClick={onNavigate}>
          <MessageCircle size={18} aria-hidden />
          <span className="min-w-0 flex-1 truncate">{words.dm}</span>
          <DmBadge />
        </NavLink>
      </nav>

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <UserCard />
        <AiStatusLine />
        <div className="flex items-center justify-between gap-2 px-3">
          <span className="text-sm text-fg-muted">Тема</span>
          <div className="flex items-center gap-1">
            <SchemeMenu />
            <ThemeToggle />
          </div>
        </div>
        <MadeBy className="px-3" />
      </div>

      <SectionDialog
        open={editing !== null}
        section={editing && editing !== 'new' ? editing : undefined}
        onClose={() => setEditing(null)}
        onSave={save}
      />
      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Удалить раздел «${removing?.name ?? ''}»?`}
        description="Задачи не удалятся — они останутся в «Общем» и в других разделах."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Отмена
            </Button>
            <Button data-autofocus icon={<Trash2 size={16} />} onClick={remove}>
              Удалить раздел
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </div>
  );
}
