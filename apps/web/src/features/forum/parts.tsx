import type { ForumSection, ForumThreadView, UserRole } from '@app/shared';
import {
  ArrowBigUp,
  CheckCircle2,
  EyeOff,
  Flag,
  Headset,
  Link2,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Pin,
  Sparkles,
} from 'lucide-react';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { useState } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/cn';
import { plural, timeAgo } from '@/lib/format';
import { useNow } from '@/lib/useNow';
import { CommunityIcon } from './community';
import { handle, useForumFlash } from './sections';

/** «Полезно» — один голос, повторное нажатие снимает. Без минусов: форум доброжелательный. */
export function VoteButton({
  score,
  voted,
  onVote,
  label,
  vertical = false,
}: {
  score: number;
  voted: boolean;
  onVote: () => void;
  label: string;
  vertical?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onVote}
      aria-pressed={voted}
      aria-label={`${label}: ${score}`}
      title={voted ? 'Убрать отметку «Полезно»' : 'Полезно'}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1 rounded-control text-sm tabular-nums transition-colors duration-200',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        vertical ? 'min-w-11 flex-col px-1.5 py-1' : 'h-8 px-2.5',
        voted
          ? 'bg-accent-soft font-semibold text-on-accent-soft'
          : 'text-fg-muted hover:bg-sunken hover:text-fg',
      )}
    >
      <ArrowBigUp size={vertical ? 22 : 18} aria-hidden fill={voted ? 'currentColor' : 'none'} />
      {score}
    </button>
  );
}

/** Автор: имя и пометка «Специалист» у сотрудников поддержки. */
export function Author({ name, role }: { name: string; role: UserRole }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-medium text-fg">{name}</span>
      {role === 'specialist' && (
        <span className="inline-flex h-5 items-center gap-1 rounded-full bg-accent-soft px-1.5 text-[11px] font-medium text-on-accent-soft">
          <Headset size={11} aria-hidden />
          Специалист
        </span>
      )}
    </span>
  );
}

/** Скопировать ссылку на тему. */
export function ShareLink({ id }: { id: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(`${location.origin}/forum/t/${id}`).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        });
      }}
      className="relative z-10 inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs text-fg-muted transition-colors duration-200 hover:bg-sunken hover:text-fg"
    >
      <Link2 size={14} aria-hidden />
      {done ? 'Ссылка скопирована' : 'Поделиться'}
    </button>
  );
}

/** Пост в ленте БатФорума — карточка как на Reddit: голос слева, сообщество, заголовок, начало текста. */
export function PostCard({
  t,
  section,
  showCommunity,
  onVote,
  menu = [],
}: {
  t: ForumThreadView;
  section?: ForumSection;
  showCommunity: boolean;
  onVote: () => void;
  /** Действия с темой: модерация, правка своей, жалоба. */
  menu?: MenuItem[];
}) {
  const now = useNow();
  return (
    <li className="relative flex overflow-hidden rounded-panel border border-line bg-surface transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-card">
      <div className="relative z-10 flex shrink-0 flex-col items-center bg-sunken/50 px-1.5 py-2.5">
        <VoteButton score={t.score} voted={t.voted} onVote={onVote} label="Полезно" vertical />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-3.5 py-3">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-fg-muted">
          {showCommunity && section && (
            <Link
              to={`/forum/s/${section.id}`}
              className="relative z-10 inline-flex items-center gap-1.5 font-semibold text-heading hover:underline"
            >
              <CommunityIcon icon={section.icon} size={20} />
              {handle(section)}
            </Link>
          )}
          {showCommunity && section && <span aria-hidden>·</span>}
          <span>
            <Author name={t.authorName} role={t.authorRole} />
          </span>
          <span aria-hidden>·</span>
          <time dateTime={t.createdAt}>{timeAgo(t.createdAt, now)}</time>
          {t.pinned && (
            <span className="ml-1 inline-flex items-center gap-1 font-medium text-heading">
              <Pin size={12} aria-hidden /> Закреплено
            </span>
          )}
          <ThreadFlags t={t} />
        </p>
        {t.because && (
          <p className="inline-flex items-center gap-1.5 self-start rounded-full bg-accent-soft px-2 py-0.5 text-xs text-on-accent-soft">
            <Sparkles size={12} aria-hidden />
            <span className="line-clamp-1">Похоже на ваше обращение «{t.because}»</span>
          </p>
        )}
        <h3 className="font-serif text-[19px] leading-snug font-medium text-heading">
          {/* вся карточка кликабельна: растянутая ссылка, кнопки — поверх (z-10) */}
          <Link
            to={`/forum/t/${t.id}`}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-panel focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-focus"
          >
            {t.title}
          </Link>
        </h3>
        {t.body && <p className="line-clamp-3 text-sm leading-relaxed text-fg-muted">{t.body}</p>}
        <div className="-ml-2.5 flex flex-wrap items-center gap-1 pt-0.5">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs text-fg-muted">
            <MessageSquare size={14} aria-hidden />
            {t.replyCount} {plural(t.replyCount, 'ответ', 'ответа', 'ответов')}
          </span>
          {t.solved && (
            <span className="inline-flex h-8 items-center gap-1.5 px-1.5 text-xs font-medium text-heading">
              <CheckCircle2 size={14} aria-hidden /> Есть решение
            </span>
          )}
          <ShareLink id={t.id} />
          {t.fromRequest && (
            <span className="px-1.5 text-xs text-fg-muted">из решённого обращения</span>
          )}
          {menu.length > 0 && (
            <span className="relative z-10 ml-auto">
              <Menu
                label={`Действия с темой «${t.title}»`}
                icon={<MoreHorizontal size={18} />}
                items={menu}
                triggerClassName="size-8"
              />
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

/** Пометки темы: закрыта, скрыта, жалобы (жалобы видит специалист). */
export function ThreadFlags({ t }: { t: ForumThreadView }) {
  return (
    <>
      {t.locked && (
        <span className="ml-1 inline-flex items-center gap-1 font-medium text-heading">
          <Lock size={12} aria-hidden /> Закрыта
        </span>
      )}
      {t.hidden && (
        <span className="ml-1 inline-flex items-center gap-1 font-medium text-heading">
          <EyeOff size={12} aria-hidden /> Скрыта до проверки
        </span>
      )}
      {(t.reports ?? 0) > 0 && (
        <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-accent-soft px-1.5 py-0.5 font-semibold text-on-accent-soft">
          <Flag size={12} aria-hidden />
          {t.reports} {plural(t.reports ?? 0, 'жалоба', 'жалобы', 'жалоб')}
        </span>
      )}
    </>
  );
}

/** Короткое сообщение внизу экрана форума. */
export function ForumFlash() {
  const text = useForumFlash((s) => s.text);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      {text && (
        <p className="pointer-events-auto max-w-md rounded-full bg-primary px-4 py-2 text-sm font-medium text-on-primary shadow-raised">
          {text}
        </p>
      )}
    </div>
  );
}
