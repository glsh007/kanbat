import { brandWords } from '@/brand/orgBrand';
import type { ForumDraft, ForumSection, ForumSort, ForumThreadView } from '@app/shared';
import { Flame, MessagesSquare, Plus, Search, Sparkles, Trophy, Clock, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { useRole } from '@/features/board/store';
import { handle } from '@/features/forum/sections';
import { ForumLayout } from '@/features/forum/ForumLayout';
import { NewThreadDialog } from '@/features/forum/NewThreadDialog';
import { PostCard } from '@/features/forum/parts';
import { useThreadActions } from '@/features/forum/ThreadActions';
import { useForumSections } from '@/features/forum/sections';
import { AppShell } from '@/layout/AppShell';
import { useNavTitle } from '@/features/nav/useNavTitle';
import { forumApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/format';

const SORTS: { id: ForumSort; label: string; icon: typeof Flame }[] = [
  { id: 'best', label: 'Для вас', icon: Sparkles },
  { id: 'new', label: 'Новое', icon: Clock },
  { id: 'top', label: 'Топ', icon: Trophy },
  { id: 'unanswered', label: 'Без ответа', icon: MessagesSquare },
];

/**
 * Бат-Форум (ТЗ v4.3, п. 16): по центру — строка поиска и лента рекомендаций;
 * если что-то ввести в поиск — вместо ленты результаты. Слева — о сообществе, справа — сообщества.
 */
export function ForumPage() {
  const { sectionId } = useParams();
  const navigate = useNavigate();
  // у специалиста нет своих обращений: «Для вас» и «напишите обращение» ему не нужны
  const specialist = useRole() === 'specialist';
  const sections = useForumSections((s) => s.sections);
  const loadSections = useForumSections((s) => s.load);
  const [sort, setSort] = useState<ForumSort>('best');
  const [query, setQuery] = useState('');
  const [everywhere, setEverywhere] = useState(false);
  const [threads, setThreads] = useState<ForumThreadView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ForumDraft | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const q = query.trim();
  const section = sections.find((s) => s.id === sectionId);
  useNavTitle(section ? `${brandWords().forum}, ${handle(section)}` : brandWords().forum);
  // поиск в сообществе — по нему; «искать везде» — по всему форуму
  const scope = q && everywhere ? undefined : sectionId;

  useEffect(() => setEverywhere(false), [sectionId]);

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = window.setTimeout(
      () => {
        forumApi
          .threads({ section: scope, sort, q: q || undefined }, ctrl.signal)
          .then((list) => {
            setThreads(list);
            setError(null);
          })
          .catch((e: Error) => {
            if (e.name !== 'AbortError') setError(e.message);
          });
      },
      q ? 300 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [scope, sort, q]);

  const vote = async (id: string) => {
    try {
      const page = await forumApi.voteThread(id);
      setThreads(
        (list) =>
          list?.map((t) =>
            t.id === id ? { ...t, score: page.thread.score, voted: page.thread.voted } : t,
          ) ?? list,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const create = (title = '') => setDraft({ sectionId: sectionId ?? 'other', title, body: '' });

  return (
    <AppShell
      title={brandWords().forum}
      subtitle={
        section ? `${handle(section)} · ${section.name}` : 'Похожие проблемы и ответы коллег'
      }
    >
      <ForumLayout sectionId={sectionId} onCreate={() => create()}>
        {/* строка поиска — как на Reddit, крупная и по центру */}
        <div className="relative">
          <Search
            size={18}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-fg-muted"
          />
          <label htmlFor="forum-search" className="sr-only">
            Поиск по {brandWords().forumDat}
          </label>
          <input
            ref={searchRef}
            id="forum-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuery('');
            }}
            placeholder={
              section ? `Искать в ${handle(section)}` : `Искать на ${brandWords().forumPrep}`
            }
            className={cn(
              'h-12 w-full rounded-full border border-line bg-surface pr-11 pl-11 text-[15px] text-fg shadow-card',
              'transition-[border-color,box-shadow] duration-200 placeholder:text-fg-muted',
              'focus-visible:border-line-strong focus-visible:shadow-raised focus-visible:outline-none',
              '[&::-webkit-search-cancel-button]:hidden',
            )}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                searchRef.current?.focus();
              }}
              aria-label="Очистить поиск"
              className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-fg-muted hover:bg-sunken hover:text-fg"
            >
              <X size={16} aria-hidden />
            </button>
          )}
        </div>

        {q ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-serif text-xl font-medium">Результаты по «{q}»</h2>
            {threads && (
              <span className="text-sm text-fg-muted">
                {threads.length} {plural(threads.length, 'тема', 'темы', 'тем')}
                {scope && section ? ` в ${handle(section)}` : ' во всех сообществах'}
              </span>
            )}
            {sectionId && !everywhere && (
              <button
                type="button"
                onClick={() => setEverywhere(true)}
                className="text-sm font-medium text-heading underline-offset-4 hover:underline"
              >
                Искать везде
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-serif text-xl font-medium">
              {sort === 'best'
                ? section
                  ? 'Лучшее в сообществе'
                  : 'Рекомендации'
                : SORTS.find((s) => s.id === sort)?.label}
            </h2>
            <div
              role="radiogroup"
              aria-label="Что показать"
              className="-mx-1 flex gap-1 overflow-x-auto px-1"
            >
              {SORTS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={sort === id}
                  onClick={() => setSort(id)}
                  className={cn(
                    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-sm transition-colors duration-200 sm:px-3',
                    sort === id
                      ? 'bg-surface font-medium text-heading shadow-card ring-1 ring-line'
                      : 'text-fg-muted hover:bg-surface hover:text-fg',
                  )}
                >
                  <Icon size={15} aria-hidden className="hidden sm:block" />
                  {id === 'best' && (section || specialist) ? 'Лучшее' : label}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm font-medium text-heading">
            {error}
          </p>
        )}

        {threads === null ? (
          <p className="px-1 py-6 text-sm text-fg-muted">Загружаю…</p>
        ) : threads.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-panel border border-dashed border-line-strong px-4 py-12 text-center">
            <MessagesSquare size={32} aria-hidden className="text-fg-muted" />
            <p className="text-fg-muted">
              {q ? 'Ничего не нашлось. Спросите коллег — создайте тему.' : 'Здесь пока нет тем.'}
            </p>
            <Button size="sm" icon={<Plus size={16} />} onClick={() => create(q)}>
              {q ? `Создать тему «${q.length > 40 ? `${q.slice(0, 40)}…` : q}»` : 'Создать тему'}
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {threads.map((t) => (
              <ThreadCard
                key={t.id}
                t={t}
                section={sections.find((s) => s.id === t.sectionId)}
                showCommunity={!sectionId || !!(q && everywhere)}
                canModerate={specialist}
                onVote={() => void vote(t.id)}
                onChanged={(next) =>
                  setThreads(
                    (list) =>
                      list
                        // перенесли в другое сообщество — из ленты этого сообщества уходит
                        ?.filter((x) => x.id !== next.id || !scope || next.sectionId === scope)
                        .map((x) => (x.id === next.id ? { ...x, ...next, body: x.body } : x)) ??
                      list,
                  )
                }
                onRemoved={() => setThreads((list) => list?.filter((x) => x.id !== t.id) ?? list)}
              />
            ))}
          </ul>
        )}

        {q && threads && threads.length > 0 && (
          <p className="px-1 text-sm text-fg-muted">
            Не то?{' '}
            <button
              type="button"
              onClick={() => create(q)}
              className="font-medium text-heading underline-offset-4 hover:underline"
            >
              Создайте тему
            </button>{' '}
            {!specialist && (
              <>
                {' '}
                или{' '}
                <Link
                  to="/"
                  className="font-medium text-heading underline-offset-4 hover:underline"
                >
                  напишите обращение
                </Link>
              </>
            )}
            .
          </p>
        )}
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
}

/** Карточка темы в ленте с меню действий (модерация, правка своей темы, жалоба). */
function ThreadCard({
  t,
  section,
  showCommunity,
  canModerate,
  onVote,
  onChanged,
  onRemoved,
}: {
  t: ForumThreadView;
  section?: ForumSection;
  showCommunity: boolean;
  canModerate: boolean;
  onVote: () => void;
  onChanged: (t: ForumThreadView) => void;
  onRemoved: () => void;
}) {
  const { items, dialogs } = useThreadActions({
    thread: t,
    canModerate,
    onChanged: (page) => onChanged(page.thread),
    onRemoved,
    // скрылась после жалоб — из ленты уходит; иначе просто отмечаем «жалоба отправлена»
    onReported: (hidden) => (hidden ? onRemoved() : onChanged({ ...t, reported: true })),
  });
  return (
    <>
      <PostCard
        t={t}
        section={section}
        showCommunity={showCommunity}
        onVote={onVote}
        menu={items}
      />
      {dialogs}
    </>
  );
}
