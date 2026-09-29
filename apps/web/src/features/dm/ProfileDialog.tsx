import type { DmProfileView } from '@app/shared';
import { Headset } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { dmApi } from '@/lib/api';
import { useDm } from './store';

/**
 * Профиль человека: имя, @ник, роль, аватарка. Написать отсюда нельзя (ТЗ v4.19): личный
 * вопрос задают из темы Бат-Форума, где человек отвечал. Здесь же — «Разблокировать».
 */
export function ProfileDialog() {
  const key = useDm((s) => s.profileKey);
  const close = useDm((s) => s.closeProfile);
  const [view, setView] = useState<DmProfileView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setView(null);
    setError(null);
    if (!key) return;
    dmApi
      .profile(key)
      .then(setView)
      .catch((e: Error) => setError(e.message));
  }, [key]);

  const unblock = async (id: string) => {
    setBusy(true);
    try {
      await dmApi.unblock(id);
      if (key) setView(await dmApi.profile(key));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const p = view?.profile;
  return (
    <Dialog open={!!key} onClose={close} title="Профиль">
      {!view && !error && <p className="text-sm text-fg-muted">Загрузка…</p>}
      {p && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Avatar name={p.name} userId={p.id} avatar={p.avatar} size={52} />
            <div className="min-w-0">
              <p className="truncate text-lg font-medium text-heading">{p.name}</p>
              <p className="text-sm text-fg-muted">
                {p.username ? `@${p.username}` : 'без ника'}
                {p.role === 'specialist' && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-accent-soft px-1.5 text-xs font-medium text-on-accent-soft">
                    <Headset size={11} aria-hidden /> Специалист
                  </span>
                )}
              </p>
            </div>
          </div>
          {view.me ? (
            <p className="text-sm text-fg-muted">Это вы.</p>
          ) : view.blockedByMe ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-fg-muted">
                Вы заблокировали этого человека — он не может задать вам вопрос, а вы ему.
              </p>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => void unblock(p.id)}
              >
                Разблокировать
              </Button>
            </div>
          ) : (
            <p className="text-sm text-fg-muted">
              {view.open
                ? 'Задать личный вопрос можно в теме Бат-Форума, где человек отвечал, — кнопкой «Спросить лично».'
                : 'Сейчас не принимает личные вопросы — спросите в теме Бат-Форума.'}
            </p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-heading">
          {error}
        </p>
      )}
    </Dialog>
  );
}
