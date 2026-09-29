import { Building2, MessageCircle, MessagesSquare, ShieldAlert } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router';
import { Logo } from '@/brand/Logo';
import { MadeBy } from '@/brand/MadeBy';
import { SchemeMenu } from '@/components/ui/SchemePicker';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { AiStatusLine } from '@/features/agent/AiStatusLine';
import { useReviewCount, useReviewPolling } from '@/features/forum/sections';
import { QUEUES, queuePath, queuesFor, useQueueCounts, type Queue } from '@/features/support/data';
import { useUser } from '@/lib/session';
import { navItemClass } from './navItem';
import { DmBadge } from '@/features/dm/DmBadge';
import { UserCard } from './UserCard';

/** Какая очередь открыта: /support → «Все», /support/new/t/… → «Новые». */
function activeQueue(pathname: string): Queue | null {
  if (!pathname.startsWith('/support')) return null;
  const seg = pathname.split('/')[2];
  const q = QUEUES.find((x) => x.id === seg);
  return q ? q.id : 'all';
}

/**
 * Меню специалиста (ТЗ v4.4, п. 14): вместо личных разделов — очереди заявок и Бат-Форум.
 * Личной доски у специалиста нет — только пульт поддержки.
 */
export function SupportNav({ onNavigate }: { onNavigate?: () => void }) {
  const me = useUser();
  const admin = me?.admin === true;
  const counts = useQueueCounts({ id: me?.id ?? null, admin });
  useReviewPolling(!!me);
  const review = useReviewCount((s) => s.count);
  const toReview = review.reports + review.proposals;
  const { pathname } = useLocation();
  const active = activeQueue(pathname);

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-2 pt-1">
        <Logo variant="full" size={28} />
      </div>

      <nav aria-label="Меню специалиста" className="flex min-h-0 flex-1 flex-col gap-1">
        <h2 className="px-3 pb-1 text-xs font-medium text-fg-muted">Пульт поддержки</h2>
        <ul className="flex flex-col gap-0.5">
          {queuesFor(admin).map(({ id, label, icon: Icon }) => {
            const isActive = active === id;
            const n = counts[id];
            return (
              <li key={id}>
                <Link
                  to={queuePath(id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={navItemClass({ isActive })}
                  onClick={onNavigate}
                >
                  <Icon size={18} aria-hidden className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {id === 'new' && n > 0 ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-on-primary tabular-nums">
                      <span className="sr-only">Новых заявок: </span>
                      {n}
                    </span>
                  ) : (
                    <span className="text-xs text-fg-muted tabular-nums">
                      <span className="sr-only">Заявок: </span>
                      {n}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        <h2 className="px-3 pt-4 pb-1 text-xs font-medium text-fg-muted">Сообщество</h2>
        <NavLink to="/forum" end className={navItemClass} onClick={onNavigate}>
          <MessagesSquare size={18} aria-hidden />
          <span className="min-w-0 flex-1 truncate">Бат-Форум</span>
        </NavLink>
        <NavLink to="/messages" className={navItemClass} onClick={onNavigate}>
          <MessageCircle size={18} aria-hidden />
          <span className="min-w-0 flex-1 truncate">Бат-общение</span>
          <DmBadge />
        </NavLink>
        <NavLink to="/forum/review" className={navItemClass} onClick={onNavigate}>
          <ShieldAlert size={18} aria-hidden />
          <span className="min-w-0 flex-1 truncate">На проверке</span>
          {toReview > 0 ? (
            <span
              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-on-primary tabular-nums"
              title={`Жалоб: ${review.reports}, предложений сообществ: ${review.proposals}`}
            >
              <span className="sr-only">
                Жалоб: {review.reports}, предложений сообществ: {review.proposals}. Всего:{' '}
              </span>
              {toReview}
            </span>
          ) : (
            <span className="text-xs text-fg-muted tabular-nums">
              <span className="sr-only">Ждёт проверки: </span>0
            </span>
          )}
        </NavLink>

        {me?.admin && (
          <>
            <h2 className="px-3 pt-4 pb-1 text-xs font-medium text-fg-muted">Администратор</h2>
            <NavLink to="/org" className={navItemClass} onClick={onNavigate}>
              <Building2 size={18} aria-hidden />
              <span className="min-w-0 flex-1 truncate">Организация</span>
            </NavLink>
          </>
        )}
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
    </div>
  );
}
