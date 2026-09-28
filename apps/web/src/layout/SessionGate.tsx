import { RotateCcw } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { recoverInterrupted } from '@/features/agent/agent';
import { resetBoardForLogin, useBoard } from '@/features/board/store';
import { lastLoadError, startSaving, stopSaving } from '@/features/board/serverStorage';
import { startTicketSync } from '@/features/support/sync';
import { startTicketsPolling } from '@/features/support/tickets';
import { useSession } from '@/lib/session';
import { LoginPage } from '@/pages/LoginPage';
import { SplashScreen } from './SplashScreen';

type Phase = 'loading' | 'ready' | 'error';

/**
 * Вход → загрузка своей доски с сервера → приложение.
 * После загрузки: изменения доски сохраняются на сервер, обращения к специалисту синхронизируются.
 * Специалист личной доски не загружает — у него только заявки (опрос сервера).
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const token = useSession((s) => s.token);
  const role = useSession((s) => s.user?.role);
  const [phase, setPhase] = useState<Phase>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    let stopSync: (() => void) | null = null;
    setPhase('loading');
    resetBoardForLogin();
    // у специалиста нет личной доски: только пульт поддержки (ТЗ v4.4, п. 14)
    if (role === 'specialist') {
      setPhase('ready');
      return;
    }
    void Promise.resolve(useBoard.persist.rehydrate()).then(() => {
      if (!alive) return;
      if (lastLoadError()) return setPhase('error');
      // ответы, которые писались до перезагрузки, уже не придут — не «думаем» вечно
      recoverInterrupted();
      // срок хранения: у давно решённых обращений переписка удаляется, карточка остаётся (ТЗ v4.16)
      useBoard.getState().pruneExpired();
      startSaving();
      stopSync = startTicketSync();
      setPhase('ready');
    });
    return () => {
      alive = false;
      stopSync?.();
      void stopSaving();
    };
  }, [token, role, attempt]);

  // пульт специалиста — заявки всех сотрудников
  useEffect(() => {
    if (!token || role !== 'specialist' || phase !== 'ready') return;
    return startTicketsPolling();
  }, [token, role, phase]);

  if (!token) return <LoginPage />;
  if (phase === 'loading') return <SplashScreen label="Загружаю ваши обращения…" />;
  if (phase === 'error')
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas p-6 text-center">
        <div className="flex max-w-sm flex-col items-center gap-3">
          <h1 className="text-lg text-heading">Не удалось загрузить доску</h1>
          <p className="text-fg-muted">{lastLoadError()?.message}</p>
          <Button icon={<RotateCcw size={16} />} onClick={() => setAttempt((n) => n + 1)}>
            Повторить
          </Button>
        </div>
      </div>
    );
  return <>{children}</>;
}
