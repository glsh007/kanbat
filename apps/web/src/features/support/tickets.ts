import type { CloseReason, SupportTimers, Ticket } from '@app/shared';
import { create } from 'zustand';
import { serverApi } from '@/lib/api';

/**
 * Обращения всех пользователей — для доски специалиста. Опрашиваем сервер раз в несколько секунд.
 */
type TicketsState = {
  tickets: Ticket[];
  loaded: boolean;
  error: string | null;
};

export const useTickets = create<TicketsState>()(() => ({
  tickets: [],
  loaded: false,
  error: null,
}));

function upsert(t: Ticket) {
  useTickets.setState((s) => ({
    tickets: s.tickets.some((x) => x.id === t.id)
      ? s.tickets.map((x) => (x.id === t.id ? t : x))
      : [...s.tickets, t],
  }));
}

export async function refreshTickets() {
  try {
    const tickets = await serverApi.tickets();
    useTickets.setState({ tickets, loaded: true, error: null });
  } catch (e) {
    useTickets.setState({ loaded: true, error: (e as Error).message });
  }
}

export function startTicketsPolling(): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const loop = async () => {
    if (stopped) return;
    await refreshTickets();
    if (!stopped)
      timer = setTimeout(() => void loop(), document.visibilityState === 'visible' ? 4000 : 20000);
  };
  void loop();
  void loadSupportTimers();
  return () => {
    stopped = true;
    clearTimeout(timer);
    useTickets.setState({ tickets: [], loaded: false, error: null });
  };
}

export const specialist = {
  take: async (id: string) => upsert(await serverApi.take(id)),
  reply: async (id: string, text: string) => upsert(await serverApi.reply(id, text)),
  release: async (id: string) => upsert(await serverApi.release(id)),
  close: async (id: string, reason: CloseReason, note: string) =>
    upsert(await serverApi.close(id, reason, note)),
  assign: async (id: string, specialistId: string | null) =>
    upsert(await serverApi.assign(id, specialistId)),
};

/** Сроки заявок (ТЗ v4.22) — для подписей «закроется через…»; по умолчанию 24 / 4 ч. */
export const useSupportTimers = create<SupportTimers>()(() => ({ closeHours: 24, returnHours: 4 }));

export async function loadSupportTimers() {
  try {
    useSupportTimers.setState(await serverApi.supportSettings());
  } catch {
    /* по умолчанию */
  }
}
