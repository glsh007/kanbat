import type { DmUnread } from '@app/shared';
import { create } from 'zustand';
import { dmApi } from '@/lib/api';

/** «Спросить лично» (ТЗ v4.19): кого и по какой теме. */
export type AskTarget = {
  threadId: string;
  threadTitle: string;
  user: { id: string; name: string; avatar?: string };
};

/**
 * Бат-общение (ТЗ v4.17–v4.19): счётчик непрочитанных для меню, открытый профиль и окно вопроса.
 * Новые сообщения приходят опросом, как ответы специалиста (раз в 8 с, в фоне — раз в 30 с).
 */
type DmState = {
  unread: DmUnread;
  /** Чей профиль открыт: id или @ник (null — закрыт). */
  profileKey: string | null;
  /** Окно «Спросить лично» (null — закрыто). */
  ask: AskTarget | null;
  openAsk: (t: AskTarget) => void;
  closeAsk: () => void;
  /** Растёт при каждом обновлении — «Бат-общение» перечитывают список. */
  tick: number;
  openProfile: (key: string) => void;
  closeProfile: () => void;
  refresh: () => Promise<void>;
};

export const useDm = create<DmState>()((set) => ({
  unread: { messages: 0, requests: 0, total: 0 },
  profileKey: null,
  ask: null,
  openAsk: (ask) => set({ ask, profileKey: null }),
  closeAsk: () => set({ ask: null }),
  tick: 0,
  openProfile: (key) => set({ profileKey: key }),
  closeProfile: () => set({ profileKey: null }),
  refresh: async () => {
    try {
      const unread = await dmApi.unread();
      set((s) => ({ unread, tick: s.tick + 1 }));
    } catch {
      /* нет связи — попробуем позже */
    }
  },
}));

/** Запускается после входа; возвращает остановку. */
export function startDmPolling(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const loop = async () => {
    await useDm.getState().refresh();
    if (stopped) return;
    timer = setTimeout(loop, document.visibilityState === 'visible' ? 8000 : 30000);
  };
  void loop();
  const onShow = () => document.visibilityState === 'visible' && void useDm.getState().refresh();
  document.addEventListener('visibilitychange', onShow);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    document.removeEventListener('visibilitychange', onShow);
  };
}
