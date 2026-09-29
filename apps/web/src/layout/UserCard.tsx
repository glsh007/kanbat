import { CloudOff, LogOut, Settings } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { IconButton } from '@/components/ui/IconButton';
import { SettingsDialog } from '@/features/account/SettingsDialog';
import { useSaveState } from '@/features/board/serverStorage';
import { logout, useUser } from '@/lib/session';

/** Кто вошёл, состояние сохранения на сервер и выход (вместо демо-переключателя ролей). */
export function UserCard() {
  const user = useUser();
  const save = useSaveState((s) => s.state);
  const saveError = useSaveState((s) => s.message);
  const [confirm, setConfirm] = useState(false);
  const [settings, setSettings] = useState(false);
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 px-3">
      <Avatar name={user.name} userId={user.id} avatar={user.avatar} size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-heading">{user.name}</p>
        <p className="text-xs text-fg-muted">
          {user.role === 'specialist' ? 'Специалист' : 'Пользователь'}
        </p>
        {/* показываем только когда есть что сказать: сохраняю / нет связи */}
        <p className="flex items-center gap-1 text-xs text-fg-muted" aria-live="polite">
          {save === 'offline' ? (
            <>
              <CloudOff size={12} aria-hidden /> нет связи, повторю
            </>
          ) : save === 'error' ? (
            <span className="font-medium text-heading">не сохранено: {saveError}</span>
          ) : save === 'saving' ? (
            'сохраняю…'
          ) : null}
        </p>
      </div>
      <IconButton
        label="Настройки"
        icon={<Settings size={18} />}
        size="sm"
        onClick={() => setSettings(true)}
      />
      <IconButton
        label="Выйти"
        icon={<LogOut size={18} />}
        size="sm"
        onClick={() => setConfirm(true)}
      />
      <SettingsDialog open={settings} onClose={() => setSettings(false)} />
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Выйти из Канбата?"
        description={
          user.role === 'specialist'
            ? 'Заявки остаются на сервере — войдите снова с кодом специалиста.'
            : 'Ваши обращения сохранены на сервере — войдите с тем же ником и паролем — они откроются снова.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Отмена
            </Button>
            <Button data-autofocus icon={<LogOut size={16} />} onClick={() => void logout()}>
              Выйти
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </div>
  );
}
