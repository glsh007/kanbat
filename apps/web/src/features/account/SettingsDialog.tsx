import { Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { SchemePicker } from '@/components/ui/SchemePicker';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { AiSettings } from '@/features/agent/AiSettings';
import { useBoard, useViewMode } from '@/features/board/store';
import { useUser } from '@/lib/session';
import { deleteAccount } from './account';
import { ChangePassword } from './ChangePassword';
import { DmSettings } from '@/features/dm/DmSettings';
import { NickSetup } from '@/features/dm/NickSetup';
import { AutoDelete } from './AutoDelete';
import { AvatarSettings } from './AvatarSettings';
import { RecoverySettings } from './RecoveryPhrase';
import { ScalePicker } from './ScalePicker';

type Confirm = null | 'delete';

/**
 * Настройки: оформление, вид экрана, ИИ, демо-данные и удаление аккаунта — всё, что не нужно каждый день.
 * У специалиста личной доски нет — остаётся только аккаунт.
 */
export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useUser();
  const specialist = user?.role === 'specialist';
  const view = useViewMode();
  const setSettings = useBoard((s) => s.setSettings);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [demoAdded, setDemoAdded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setConfirm(null);
    setDemoAdded(false);
    setError(null);
    onClose();
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const section = 'flex flex-col gap-2 border-t border-line pt-4 first:border-t-0 first:pt-0';
  const h = 'text-sm font-semibold text-heading';

  return (
    <>
      <Dialog open={open && confirm === null} onClose={close} title="Настройки">
        <div className="flex flex-col gap-4">
          <section className={section} aria-labelledby="set-look">
            <h3 id="set-look" className={h}>
              Оформление
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              <ThemeToggle />
              <p className="min-w-0 flex-1 text-xs text-fg-muted">
                Тема: как в системе, светлая или тёмная.
              </p>
            </div>
            <SchemePicker />
            <p className="text-xs text-fg-muted">
              Цвет кнопок, акцентов и узора на доске. Сохраняется в кабинете — на всех ваших
              устройствах.
            </p>
            <ScalePicker />
          </section>

          {user && (
            <section className={section} aria-labelledby="set-avatar">
              <h3 id="set-avatar" className={h}>
                Аватарка
              </h3>
              <AvatarSettings user={user} />
            </section>
          )}

          {!specialist && (
            <>
              <section className={section} aria-labelledby="set-view">
                <h3 id="set-view" className={h}>
                  Вид экрана
                </h3>
                <div className="flex flex-wrap items-center gap-3">
                  <ViewToggle value={view} onChange={(v) => setSettings({ view: v })} />
                  <p className="min-w-0 flex-1 text-xs text-fg-muted">
                    «Доска» — все обращения по этапам столбцами, для продвинутых.
                  </p>
                </div>
              </section>

              <section className={section} aria-label="ИИ">
                <div className="-mx-3">
                  <AiSettings />
                </div>
              </section>

              <section className={section} aria-labelledby="set-data">
                <h3 id="set-data" className={h}>
                  Данные
                </h3>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Sparkles size={16} />}
                    onClick={() => {
                      useBoard.getState().addDemo();
                      setDemoAdded(true);
                    }}
                  >
                    Добавить примеры обращений
                  </Button>
                  <p className="min-w-0 flex-1 text-xs text-fg-muted" aria-live="polite">
                    {demoAdded
                      ? 'Примеры добавлены — ваши обращения на месте.'
                      : 'Добавит несколько примеров к вашим обращениям, ничего не удаляя.'}
                  </p>
                </div>
              </section>
            </>
          )}

          {user && (
            <section className={section} aria-labelledby="set-dm">
              <h3 id="set-dm" className={h}>
                Бат-общение
              </h3>
              <DmSettings user={user} />
            </section>
          )}

          <section className={section} aria-labelledby="set-account">
            <h3 id="set-account" className={h}>
              Аккаунт
            </h3>
            <p className="text-xs text-fg-muted">
              {specialist
                ? `Вы вошли как специалист «${user?.name}». Удаление сотрёт ваш вход и сообщения на Бат-Форуме; ответы в заявках останутся у сотрудников.`
                : `Вы вошли как «${user?.name}». Удаление сотрёт ваши обращения, переписку, разделы и сообщения на Бат-Форуме и выполнит выход на всех устройствах.`}
            </p>
            {user?.username ? (
              <p className="text-sm">
                Ваш ник: <span className="font-medium text-heading">@{user.username}</span> — по
                нему вы входите.
              </p>
            ) : (
              <NickSetup />
            )}
            <ChangePassword />
            {user && <RecoverySettings user={user} />}
            {user && <AutoDelete user={user} />}
            <div>
              <Button
                size="sm"
                variant="secondary"
                icon={<Trash2 size={16} />}
                onClick={() => setConfirm('delete')}
              >
                Удалить аккаунт
              </Button>
            </div>
          </section>
        </div>
      </Dialog>

      <Dialog
        open={open && confirm === 'delete'}
        onClose={() => !busy && setConfirm(null)}
        title="Удалить аккаунт навсегда?"
        description={
          specialist
            ? `Специалист «${user?.name ?? ''}» и его сообщения на Бат-Форуме будут удалены с сервера. Восстановить нельзя.`
            : `Пользователь «${user?.name ?? ''}», все обращения, переписка, разделы и обращения к специалисту будут удалены с сервера. Восстановить нельзя.`
        }
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirm(null)}>
              Отмена
            </Button>
            <Button
              data-autofocus
              icon={<Trash2 size={16} />}
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? 'Удаляю…' : 'Удалить навсегда'}
            </Button>
          </>
        }
      >
        {error ? (
          <p role="alert" className="text-sm font-medium text-heading">
            {error}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}
