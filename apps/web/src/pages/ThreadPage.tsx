import type { ForumDraft, ForumReplyView, ForumThreadPage } from '@app/shared';
import {
  ArrowLeft,
  CheckCircle2,
  EyeOff,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Pin,
  Send,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { CommunityIcon } from '@/features/forum/community';
import { FORUM_NAME, handle } from '@/features/forum/sections';
import { ForumLayout } from '@/features/forum/ForumLayout';
import { NewThreadDialog } from '@/features/forum/NewThreadDialog';
import { Author, ShareLink, ThreadFlags, VoteButton } from '@/features/forum/parts';
import { useThreadActions } from '@/features/forum/ThreadActions';
import { useForumSections } from '@/features/forum/sections';
import { Markdown } from '@/features/task/Markdown';
import { AppShell } from '@/layout/AppShell';
import { clip } from '@/features/nav/history';
import { useNavTitle } from '@/features/nav/useNavTitle';
import { forumApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { plural, timeAgo } from '@/lib/format';
import { useNow } from '@/lib/useNow';

/** Кружок с первой буквой имени — как аватар комментатора. */
function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-full bg-sunken text-sm font-semibold text-heading ring-1 ring-line"
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

/**
 * Тема БатФорума: пост (голос слева, как на Reddit), поле ответа, ответы —
 * решение первым, дальше по «Помогло». Слева — о сообществе, справа — сообщества.
 */
export function ThreadPage() {
  const { threadId = '' } = useParams();
  const navigate = useNavigate();
  const now = useNow();
  const sections = useForumSections((s) => s.sections);
  const loadSections = useForumSections((s) => s.load);
  const [page, setPage] = useState<ForumThreadPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<ForumDraft | null>(null);
  const replyId = useId();

  useEffect(() => {
    setPage(null);
    setError(null);
    forumApi
      .thread(threadId)
      .then(setPage)
      .catch((e: Error) => setError(e.message));
  }, [threadId]);

  /** Действие, которое возвращает обновлённую тему. */
  const act = useCallback(async (run: () => Promise<ForumThreadPage>) => {
    setError(null);
    try {
      setPage(await run());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const send = async () => {
    const clean = text.trim();
    if (!clean) return;
    setBusy(true);
    await act(() => forumApi.reply(threadId, clean));
    setText('');
    setBusy(false);
    void loadSections();
  };

  const t = page?.thread;
  const section = sections.find((s) => s.id === t?.sectionId);
  useNavTitle(t ? `тема «${clip(t.title)}»` : null);
  const actions = useThreadActions({
    thread: t,
    canModerate: !!page?.canModerate,
    onChanged: setPage,
    onRemoved: () => navigate(t ? `/forum/s/${t.sectionId}` : '/forum'),
    onReported: (hidden) => {
      if (hidden) navigate(t ? `/forum/s/${t.sectionId}` : '/forum');
      else setPage((p) => (p ? { ...p, thread: { ...p.thread, reported: true } } : p));
    },
  });
  const createHere = () => setDraft({ sectionId: t?.sectionId ?? 'other', title: '', body: '' });

  const shell = (children: React.ReactNode) => (
    <AppShell
      title={FORUM_NAME}
      subtitle={section ? `${handle(section)} · ${section.name}` : undefined}
    >
      <ForumLayout sectionId={t?.sectionId} onCreate={createHere}>
        {children}
      </ForumLayout>
      <NewThreadDialog
        open={draft !== null}
        draft={draft}
        onClose={() => setDraft(null)}
        onCreated={(id) => {
          setDraft(null);
          void loadSections();
          navigate(`/forum/t/${id}`);
        }}
      />
    </AppShell>
  );

  if (!page || !t)
    return shell(
      <div className="px-1 py-8 text-sm text-fg-muted">
        {error ?? 'Загружаю тему…'}
        {error && (
          <p className="mt-3">
            <Link to="/forum" className="font-medium text-heading underline underline-offset-4">
              Ко всем темам
            </Link>
          </p>
        )}
      </div>,
    );

  const canSolve = t.mine || page.canModerate;
  const threadMenu = actions.items;

  const replyMenu = (r: ForumReplyView): MenuItem[] => [
    ...(canSolve
      ? [
          {
            id: 'solution',
            label: r.solution ? 'Снять отметку «Решение»' : 'Отметить решением',
            icon: <CheckCircle2 size={16} />,
            onSelect: () => void act(() => forumApi.solution(t.id, r.solution ? null : r.id)),
          } as MenuItem,
        ]
      : []),
    ...(r.mine || page.canModerate
      ? [
          {
            id: 'del',
            label: 'Удалить ответ',
            icon: <Trash2 size={16} />,
            onSelect: () => void act(() => forumApi.removeReply(r.id)),
          } as MenuItem,
        ]
      : []),
  ];

  return shell(
    <>
      <Link
        to={section ? `/forum/s/${section.id}` : '/forum'}
        className="inline-flex items-center gap-1.5 self-start rounded-[6px] text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft size={16} aria-hidden /> {section ? handle(section) : 'Все сообщества'}
      </Link>

      {/* пост */}
      <article className="flex overflow-hidden rounded-panel border border-line bg-surface">
        <div className="flex shrink-0 flex-col items-center bg-sunken/50 px-1.5 py-3">
          <VoteButton
            score={t.score}
            voted={t.voted}
            onVote={() => void act(() => forumApi.voteThread(t.id))}
            label="У меня так же / полезно"
            vertical
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3 px-4 py-4">
          <div className="flex items-start gap-2">
            <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-fg-muted">
              {section && (
                <Link
                  to={`/forum/s/${section.id}`}
                  className="inline-flex items-center gap-1.5 font-semibold text-heading hover:underline"
                >
                  <CommunityIcon icon={section.icon} size={20} />
                  {handle(section)}
                </Link>
              )}
              <span aria-hidden>·</span>
              <Author name={t.authorName} role={t.authorRole} />
              <span aria-hidden>·</span>
              <time dateTime={t.createdAt}>{timeAgo(t.createdAt, now)}</time>
              {t.pinned && (
                <span className="ml-1 inline-flex items-center gap-1 font-medium text-heading">
                  <Pin size={12} aria-hidden /> Закреплено
                </span>
              )}
              {t.fromRequest && <span>· из решённого обращения</span>}
              <ThreadFlags t={t} />
            </p>
            {threadMenu.length > 0 && (
              <Menu
                label="Действия с темой"
                icon={<MoreHorizontal size={20} />}
                items={threadMenu}
                triggerClassName="-my-2"
              />
            )}
          </div>
          <h2 className="font-serif text-[26px] leading-tight font-medium tracking-[-0.015em]">
            {t.title}
          </h2>
          {t.body && <Markdown text={t.body} />}
          <div className="-ml-2.5 flex flex-wrap items-center gap-1">
            <span className="inline-flex h-8 items-center gap-1.5 px-2.5 text-xs text-fg-muted">
              <MessageSquare size={14} aria-hidden />
              {page.replies.length} {plural(page.replies.length, 'ответ', 'ответа', 'ответов')}
            </span>
            {t.solved && (
              <span className="inline-flex h-8 items-center gap-1.5 px-1.5 text-xs font-medium text-heading">
                <CheckCircle2 size={14} aria-hidden /> Есть решение
              </span>
            )}
            <ShareLink id={t.id} />
          </div>
        </div>
      </article>

      {t.hidden && (
        <p className="flex items-start gap-2 rounded-panel border border-line-strong bg-surface p-3 text-sm">
          <EyeOff size={16} aria-hidden className="mt-0.5 shrink-0 text-fg-muted" />
          <span>
            {t.mine
              ? 'На вашу тему пожаловались — она скрыта из ленты, пока её не проверит специалист.'
              : 'Тема скрыта из ленты после жалоб. Решите: оставить, перенести, закрыть или удалить.'}
          </span>
        </p>
      )}

      {t.modlog && t.modlog.length > 0 && (
        <section aria-label="Журнал модерации" className="flex flex-col gap-1 px-1">
          {t.modlog.map((m, i) => (
            <p key={i} className="flex items-start gap-2 text-xs text-fg-muted">
              <ShieldCheck size={14} aria-hidden className="mt-px shrink-0" />
              <span>
                <span className="font-medium text-fg">{m.byName}</span> (специалист) {m.text} ·{' '}
                <time dateTime={m.at}>{timeAgo(m.at, now)}</time>
              </span>
            </p>
          ))}
        </section>
      )}

      {error && (
        <p role="alert" className="text-sm font-medium text-heading">
          {error}
        </p>
      )}

      {/* поле ответа — над ответами, как «Добавить комментарий» на Reddit */}
      {t.locked && (
        <p className="flex items-center gap-2 rounded-panel border border-dashed border-line-strong px-3 py-3 text-sm text-fg-muted">
          <Lock size={16} aria-hidden className="shrink-0" />
          {page.canModerate
            ? 'Тема закрыта для ответов сотрудников — вы можете ответить как специалист.'
            : 'Тема закрыта для ответов. Если вопрос остался — создайте новую тему.'}
        </p>
      )}
      {(!t.locked || page.canModerate) && (
        <form
          className="flex flex-col gap-2 rounded-panel border border-line bg-surface p-3 transition-[border-color,box-shadow] duration-200 focus-within:border-line-strong focus-within:shadow-card"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label htmlFor={replyId} className="sr-only">
            Ваш ответ
          </label>
          <textarea
            id={replyId}
            rows={3}
            value={text}
            maxLength={4000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void send();
            }}
            placeholder="Добавьте ответ: что помогло вам, где нажать, на что обратить внимание"
            className="w-full resize-y bg-transparent text-[15px] leading-relaxed text-fg outline-none placeholder:text-fg-muted focus-visible:outline-none"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-fg-muted">Ctrl+Enter — отправить</p>
            <Button
              type="submit"
              size="sm"
              icon={<Send size={16} />}
              disabled={!text.trim() || busy}
            >
              Ответить
            </Button>
          </div>
        </form>
      )}

      <section aria-labelledby="replies-h" className="flex flex-col gap-1">
        <h3 id="replies-h" className="px-1 pb-2 text-sm font-medium text-fg-muted">
          {page.replies.length
            ? `Ответы · ${page.replies.length}`
            : 'Ответов пока нет — помогите коллеге'}
        </h3>
        <ol className="flex flex-col gap-2">
          {page.replies.map((r) => (
            <li
              key={r.id}
              className={cn(
                'flex gap-3 rounded-panel p-3',
                r.solution
                  ? 'bg-surface shadow-card ring-1 ring-line-strong'
                  : 'hover:bg-surface/60',
              )}
            >
              {/* аватар и «нить» комментария, как на Reddit */}
              <div className="flex flex-col items-center gap-2">
                <Avatar name={r.authorName} />
                <span aria-hidden className="w-px flex-1 bg-line" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-fg-muted">
                  <Author name={r.authorName} role={r.authorRole} />
                  <span aria-hidden>·</span>
                  <time dateTime={r.createdAt}>{timeAgo(r.createdAt, now)}</time>
                  {r.solution && (
                    <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 font-semibold text-on-accent-soft">
                      <CheckCircle2 size={12} aria-hidden /> Решение
                    </span>
                  )}
                </p>
                <Markdown text={r.body} />
                <div className="-ml-2.5 flex items-center gap-1">
                  <VoteButton
                    score={r.score}
                    voted={r.voted}
                    onVote={() => void act(() => forumApi.voteReply(r.id))}
                    label="Помогло"
                  />
                  {replyMenu(r).length > 0 && (
                    <Menu
                      label="Действия с ответом"
                      icon={<MoreHorizontal size={18} />}
                      items={replyMenu(r)}
                      triggerClassName="size-8"
                    />
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {actions.dialogs}
    </>,
  );
}
