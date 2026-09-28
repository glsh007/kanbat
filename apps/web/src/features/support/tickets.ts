import type { Ticket } from '@app/shared';
import { create } from 'zustand';
import { serverApi } from '@/lib/api';

/**
 * Обращения всех сотрудников — для доски специалиста. Опрашиваем сервер раз в несколько секунд.
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
  return () => {
    stopped = true;
    clearTimeout(timer);
    useTickets.setState({ tickets: [], loaded: false, error: null });
  };
}

export const specialist = {
  take: async (id: string) => upsert(await serverApi.take(id)),
  reply: async (id: string, text: string) => upsert(await serverApi.reply(id, text)),
  resolve: async (id: string) => upsert(await serverApi.resolve(id)),
};
