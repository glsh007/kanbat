import {
  REPORT_REASONS,
  type CommunityDraft,
  type CommunityProposal,
  type ForumReview,
  type ForumReviewItem,
} from '@app/shared';
import { Check, FolderInput, Lock, LockOpen, ShieldCheck, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { fieldClass } from '@/components/ui/Field';
import { useRole } from '@/features/board/store';
import { CommunityDialog } from '@/features/forum/CommunityDialog';
import { CommunityIcon } from '@/features/forum/community';
import { ForumFlash, ThreadFlags } from '@/features/forum/parts';
import {
  FORUM_NAME,
  handle,
  useForumFlash,
  useForumSections,
  useReviewCount,
} from '@/features/forum/sections';
import { useThreadActions } from '@/features/forum/ThreadActions';
import { AppShell } from '@/layout/AppShell';
import { useNavTitle } from '@/features/nav/useNavTitle';
import { forumApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { timeAgo } from '@/lib/format';
import { useNow } from '@/lib/useNow';

/**
 * «На проверке» (ТЗ v4.7, п. 16): специалист разбирает жалобы на темы БатФорума
 * и предложения новых сообществ от сотрудников.
 */
export function ReviewPage() {
  const specialist = useRole() === 'specialist';
  const [data, setData] = useState<ForumReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadSections = useForumSections((s) => s.load);
  const refreshCount = useReviewCount((s) => s.refresh);
  useNavTitle('на проверке');

  const reload = useCallback(async () => {
    try {
      setData(await forumApi.review());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    void refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    if (!specialist) return;
    void reload();
    void loadSections();
  }, [specialist, reload, loadSections]);

  if (!specialist)
    return (
      <AppShell title={FORUM_NAME} subtitle="На проверке">
        <p className="p-6 text-sm text-fg-muted">
          Доступ только для специалистов поддержки.{' '}
          <Link to="/forum" className="font-medium text-heading underline underline-offset-4">
            К БатФоруму
          </Link>
        </p>
      </AppShell>
    );

  const empty = data && !data.reports.length && !data.proposals.length;

  return (
    <AppShell title="На проверке" subtitle={`${FORUM_NAME}: жалобы и предложения сообществ`}>
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-8 px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
        {error && (
          <p role="alert" className="text-sm font-medium text-heading">
            {error}
          </p>
        )}
        {!data && !error && <p className="text-sm text-fg-muted">Загружаю…</p>}
        {empty && (
          <div className="flex flex-col items-center gap-3 rounded-panel border border-dashed border-line-strong px-4 py-12 text-center">
            <ShieldCheck size={32} aria-hidden className="text-fg-muted" />
            <p className="text-fg-muted">Всё проверено: жалоб и предложений нет.</p>
            <Link
              to="/forum"
              className="text-sm font-medium text-heading underline underline-offset-4"
            >
              К БатФоруму
            </Link>
          </div>
        )}

        {data && data.reports.length > 0 && (
          <section aria-labelledby="rv-reports" className="flex flex-col gap-3">
            <h2 id="rv-reports" className="font-serif text-xl font-medium">
              Жалобы · {data.reports.length}
            </h2>
            <ul className="flex flex-col gap-3">
              {data.reports.map((item) => (
                <ReportCard key={item.thread.id} item={item} onDone={() => void reload()} />
              ))}
            </ul>
          </section>
        )}

        {data && data.proposals.length > 0 && (
          <section aria-labelledby="rv-proposals" className="flex flex-col gap-3">
            <h2 id="rv-proposals" className="font-serif text-xl font-medium">
              Предложенные сообщества · {data.proposals.length}
            </h2>
            <ul className="flex flex-col gap-3">
              {data.proposals.map((p) => (
                <ProposalCard key={p.id} p={p} onDone={() => void reload()} />
              ))}
            </ul>
          </section>
        )}
      </div>
      <ForumFlash />
    </AppShell>
  );
}

/** Тема с жалобами: причины и быстрые решения. */
function ReportCard({ item, onDone }: { item: ForumReviewItem; onDone: () => void }) {
  const now = useNow();
  const sections = useForumSections((s) => s.sections);
  const t = item.thread;
  const section = sections.find((s) => s.id === t.sectionId);
  const { dialogs, openDialog, run } = useThreadActions({
    thread: t,
    canModerate: true,
    onChanged: onDone,
    onRemoved: onDone,
  });
  // одинаковые причины — вместе: «Спам или бессмыслица ×2»
  const byReason = new Map<string, number>();
  for (const r of item.reports) byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + 1);
  const notes = item.reports.filter((r) => r.note);

  return (
    <li className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-fg-muted">
        {section && (
          <span className="inline-flex items-center gap-1.5 font-semibold text-heading">
            <CommunityIcon icon={section.icon} size={20} />
            {handle(section)}
          </span>
        )}
        <span aria-hidden>·</span>
        <span>{t.authorName}</span>
        <span aria-hidden>·</span>
        <time dateTime={t.createdAt}>{timeAgo(t.createdAt, now)}</time>
        <ThreadFlags t={t} />
      </p>
      <h3 className="font-serif text-lg leading-snug font-medium">
        <Link to={`/forum/t/${t.id}`} className="hover:underline">
          {t.title}
        </Link>
      </h3>
      <ul className="flex flex-wrap gap-1.5" aria-label="Причины жалоб">
        {[...byReason].map(([reason, n]) => (
          <li
            key={reason}
            className="rounded-full bg-sunken px-2.5 py-1 text-xs font-medium text-heading ring-1 ring-line"
          >
            {REPORT_REASONS[reason as keyof typeof REPORT_REASONS]}
            {n > 1 ? ` ×${n}` : ''}
          </li>
        ))}
      </ul>
      {notes.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {notes.map((r, i) => (
            <li key={i} className="text-fg-muted">
              <span className="font-medium text-fg">{r.byName}:</span> «{r.note}»
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          icon={<ShieldCheck size={16} />}
          onClick={() =>
            void run(() => forumApi.dismissReports(t.id), 'Жалобы сняты — тема осталась')
          }
        >
          Оставить
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<FolderInput size={16} />}
          onClick={() => openDialog('move')}
        >
          Перенести
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={t.locked ? <LockOpen size={16} /> : <Lock size={16} />}
          onClick={() =>
            void run(
              () => forumApi.lock(t.id, !t.locked),
              t.locked ? 'Тема открыта для ответов' : 'Тема закрыта для ответов',
            )
          }
        >
          {t.locked ? 'Открыть' : 'Закрыть'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<Trash2 size={16} />}
          onClick={() => openDialog('delete')}
        >
          Удалить
        </Button>
      </div>
      {dialogs}
    </li>
  );
}

/** Предложение сообщества: одобрить (можно поправить) или отклонить с причиной. */
function ProposalCard({ p, onDone }: { p: CommunityProposal; onDone: () => void }) {
  const now = useNow();
  const flash = useForumFlash((s) => s.show);
  const loadSections = useForumSections((s) => s.load);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const noteId = useId();

  const approve = async (d: CommunityDraft) => {
    const s = await forumApi.approve(p.id, d);
    setApproving(false);
    flash(`Сообщество ${handle(s)} создано`);
    void loadSections();
    onDone();
  };

  return (
    <li className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <CommunityIcon icon={p.icon} size={40} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="font-serif text-lg leading-tight font-medium">{p.name}</h3>
          <p className="text-sm text-fg-muted">б/{p.slug}</p>
        </div>
      </div>
      <p className="text-sm leading-relaxed">{p.description}</p>
      <p className="text-xs text-fg-muted">
        Предложил(а) {p.authorName} ·{' '}
        <time dateTime={p.createdAt}>{timeAgo(p.createdAt, now)}</time>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<Check size={16} />} onClick={() => setApproving(true)}>
          Одобрить
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<X size={16} />}
          onClick={() => {
            setNote('');
            setRejecting(true);
          }}
        >
          Отклонить
        </Button>
      </div>

      <CommunityDialog
        open={approving}
        mode="approve"
        initial={p}
        onClose={() => setApproving(false)}
        onSubmit={approve}
      />
      <Dialog
        open={rejecting}
        onClose={() => setRejecting(false)}
        title={`Отклонить б/${p.slug}?`}
        description="Автор увидит, что предложение отклонено, и причину, если вы её напишете."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(false)} disabled={busy}>
              Отмена
            </Button>
            <Button
              icon={<X size={16} />}
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void forumApi
                  .reject(p.id, note)
                  .then(() => {
                    setRejecting(false);
                    flash('Предложение отклонено');
                    onDone();
                  })
                  .catch((e: Error) => flash(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              Отклонить
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor={noteId} className="text-sm font-medium text-heading">
            Причина <span className="font-normal text-fg-muted">(необязательно)</span>
          </label>
          <textarea
            id={noteId}
            data-autofocus
            rows={2}
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Например: такие вопросы уже обсуждают в б/сеть"
            className={cn(fieldClass, 'resize-none py-2 text-sm leading-relaxed')}
          />
        </div>
      </Dialog>
    </li>
  );
}
