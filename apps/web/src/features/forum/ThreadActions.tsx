import type { ForumThreadPage, ForumThreadView } from '@app/shared';
import {
  Flag,
  FolderInput,
  Lock,
  LockOpen,
  Pencil,
  Pin,
  PinOff,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import type { MenuItem } from '@/components/ui/Menu';
import { forumApi } from '@/lib/api';
import { useForumFlash, useForumSections, useReviewCount } from './sections';
import { MoveDialog, RenameDialog, ReportDialog } from './ThreadDialogs';

type Options = {
  thread: ForumThreadView | null | undefined;
  canModerate: boolean;
  /** Тема изменилась (перенос, закрытие, заголовок, закрепление, жалобы сняты). */
  onChanged: (page: ForumThreadPage) => void;
  /** Тема удалена. */
  onRemoved: () => void;
  /** На тему пожаловались (hidden — она скрылась из ленты). */
  onReported?: (hidden: boolean) => void;
};

type Open = 'move' | 'rename' | 'report' | 'delete' | null;

/**
 * Действия с темой Бат-Форума (ТЗ v4.7): модерация специалиста, правка своей темы, жалоба.
 * Возвращает пункты меню и окна — одно и то же в ленте, в теме и в «На проверке».
 */
export function useThreadActions({
  thread: t,
  canModerate,
  onChanged,
  onRemoved,
  onReported,
}: Options) {
  const [open, setOpen] = useState<Open>(null);
  const flash = useForumFlash((s) => s.show);
  const loadSections = useForumSections((s) => s.load);
  const refreshReview = useReviewCount((s) => s.refresh);

  const run = async (work: () => Promise<ForumThreadPage>, done?: string) => {
    try {
      onChanged(await work());
      if (done) flash(done);
      void loadSections();
      if (canModerate) void refreshReview();
    } catch (e) {
      flash((e as Error).message);
    }
  };

  const items: MenuItem[] = [];
  if (t) {
    if (canModerate) {
      items.push(
        {
          id: 'pin',
          label: t.pinned ? 'Открепить' : 'Закрепить наверху',
          icon: t.pinned ? <PinOff size={16} /> : <Pin size={16} />,
          onSelect: () => void run(() => forumApi.pin(t.id, !t.pinned)),
        },
        {
          id: 'move',
          label: 'Перенести в…',
          icon: <FolderInput size={16} />,
          onSelect: () => setOpen('move'),
        },
        {
          id: 'lock',
          label: t.locked ? 'Открыть для ответов' : 'Закрыть для ответов',
          icon: t.locked ? <LockOpen size={16} /> : <Lock size={16} />,
          onSelect: () =>
            void run(
              () => forumApi.lock(t.id, !t.locked),
              t.locked ? 'Тема снова открыта для ответов' : 'Тема закрыта для ответов',
            ),
        },
      );
      if ((t.reports ?? 0) > 0)
        items.push({
          id: 'dismiss',
          label: 'Оставить — снять жалобы',
          icon: <ShieldCheck size={16} />,
          onSelect: () => void run(() => forumApi.dismissReports(t.id), 'Жалобы сняты'),
        });
    }
    if (canModerate || t.mine)
      items.push({
        id: 'rename',
        label: 'Изменить заголовок',
        icon: <Pencil size={16} />,
        onSelect: () => setOpen('rename'),
      });
    if (!canModerate && !t.mine)
      items.push({
        id: 'report',
        label: t.reported ? 'Жалоба отправлена' : 'Пожаловаться',
        icon: <Flag size={16} />,
        disabled: t.reported,
        onSelect: () => setOpen('report'),
      });
    if (canModerate || t.mine)
      items.push(
        { kind: 'separator', id: 'sep' },
        {
          id: 'delete',
          label: 'Удалить тему',
          icon: <Trash2 size={16} />,
          onSelect: () => setOpen('delete'),
        },
      );
  }

  const close = () => setOpen(null);

  const dialogs: ReactNode = t ? (
    <>
      <MoveDialog
        open={open === 'move'}
        current={t.sectionId}
        onClose={close}
        onMove={async (sectionId, label) => {
          close();
          await run(() => forumApi.move(t.id, sectionId), `Тема перенесена в ${label}`);
        }}
      />
      <RenameDialog
        open={open === 'rename'}
        title={t.title}
        onClose={close}
        onSave={async (title) => {
          onChanged(await forumApi.rename(t.id, title));
          close();
          flash('Заголовок изменён');
          if (canModerate) void refreshReview();
        }}
      />
      <ReportDialog
        open={open === 'report'}
        onClose={close}
        onSend={async (reason, note) => {
          const r = await forumApi.report(t.id, reason, note);
          close();
          flash('Спасибо! Специалисты посмотрят тему');
          onReported?.(r.hidden);
        }}
      />
      <Dialog
        open={open === 'delete'}
        onClose={close}
        title="Удалить тему?"
        description="Тема и все ответы будут удалены для всех. Восстановить нельзя."
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Отмена
            </Button>
            <Button
              data-autofocus
              icon={<Trash2 size={16} />}
              onClick={() => {
                close();
                void forumApi
                  .removeThread(t.id)
                  .then(() => {
                    flash('Тема удалена');
                    void loadSections();
                    if (canModerate) void refreshReview();
                    onRemoved();
                  })
                  .catch((e: Error) => flash(e.message));
              }}
            >
              Удалить
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </>
  ) : null;

  return { items, dialogs, openDialog: setOpen, run };
}
