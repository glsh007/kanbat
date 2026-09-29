import { GENERAL_SECTION_ID as DEFAULT_SECTION_ID, isManualSection } from '@app/shared';
import { ListPlus, Sparkles } from 'lucide-react';
import { useCallback } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { SectionDot } from '@/components/ui/SectionDot';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { AiUnavailableBanner } from '@/features/agent/AiUnavailableBanner';
import { BoardColumns } from '@/features/board/BoardColumns';
import { useBoard, useSection, useViewMode } from '@/features/board/store';
import { RequestsView } from '@/features/requests/RequestsView';
import { AddToSectionDialog } from '@/features/sections/AddToSectionDialog';
import { useAddToSection } from '@/features/sections/addStore';
import { TaskPanel } from '@/features/task/TaskPanel';
import { AppShell } from '@/layout/AppShell';
import { clip } from '@/features/nav/history';
import { useNavTitle } from '@/features/nav/useNavTitle';

/** Личный кабинет пользователя: «Общее» или раздел — списком с чатом или канбан-доской. */
export function BoardPage() {
  const { sectionId, taskId } = useParams();
  const section = useSection(sectionId);
  const sorting = useBoard((s) => !!sectionId && !!s.sorting[sectionId]);
  const empty = useBoard((s) => Object.keys(s.tasks).length === 0);
  const view = useViewMode();
  const setSettings = useBoard((s) => s.setSettings);
  const navigate = useNavigate();
  const task = useBoard((s) => (taskId ? s.tasks[taskId] : undefined));
  useNavTitle(
    task
      ? `обращение «${clip(task.title)}»`
      : section && section.id !== DEFAULT_SECTION_ID
        ? `раздел «${clip(section.name)}»`
        : 'мои обращения',
  );
  const closeTask = useCallback(
    () => navigate(`/s/${sectionId ?? DEFAULT_SECTION_ID}`),
    [navigate, sectionId],
  );

  if (!section) return <Navigate to={`/s/${DEFAULT_SECTION_ID}`} replace />;
  const own = section.id !== DEFAULT_SECTION_ID;
  const manual = isManualSection(section);

  return (
    <AppShell
      title={
        view === 'list' && !own ? (
          'Мои обращения'
        ) : (
          <span className="inline-flex items-center gap-2">
            <SectionDot color={section.color} />
            {section.name}
          </span>
        )
      }
      subtitle={
        sorting
          ? 'ИИ раскладывает задачи по смыслу…'
          : !own
            ? view === 'list'
              ? undefined
              : 'Все обращения по этапам'
            : section.description ||
              (manual
                ? 'Ваша подборка: обращения выбираете вы'
                : 'Подборка задач из «Общего» по смыслу')
      }
      wallpaper={view === 'board'}
      actions={
        <>
          {own && (
            <Button
              size="sm"
              variant="secondary"
              icon={<ListPlus size={16} />}
              onClick={() => useAddToSection.getState().open(section.id)}
            >
              <span className="hidden sm:inline">Добавить обращения</span>
              <span className="sr-only sm:hidden">Добавить обращения</span>
            </Button>
          )}
          <ViewToggle value={view} onChange={(v) => setSettings({ view: v })} />
        </>
      }
    >
      {view === 'list' ? (
        <RequestsView sectionId={section.id} taskId={taskId} />
      ) : (
        // relative: открытый чат (lg) лежит поверх доски, а не рядом с ней
        <div className="relative flex min-h-full md:h-full">
          <div className="min-w-0 flex-1">
            <AiUnavailableBanner className="mx-3 mt-3 sm:mx-4 lg:mx-6 lg:mt-4" />
            {empty && !own && (
              <div className="mx-3 mt-3 flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 sm:mx-4 lg:mx-6">
                <p className="min-w-0 flex-1 text-sm">
                  Это ваш личный кабинет — пока пусто. Напишите обращение или посмотрите примеры.
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Sparkles size={16} />}
                  onClick={() => useBoard.getState().addDemo()}
                >
                  Показать примеры
                </Button>
              </div>
            )}
            <BoardColumns key={section.id} sectionId={section.id} />
          </div>
          {taskId && <TaskPanel key={taskId} taskId={taskId} onClose={closeTask} />}
        </div>
      )}
      <AddToSectionDialog />
    </AppShell>
  );
}
