import { messagesForSpecialist, type Message, type Task, type Ticket } from '@app/shared';
import * as agent from '@/features/agent/agent';
import { useBoard } from '@/features/board/store';
import { serverApi } from '@/lib/api';

/**
 * Синхронизация обращений к специалисту со стороны сотрудника (ТЗ v3.4, п. 15).
 * - Переданные задачи (сводка, статус и сообщения после передачи) отправляются на сервер — их видит
 *   специалист. Разговор с ИИ до передачи на сервер в обращение не попадает (ТЗ v4.4, п. 14).
 * - Раз в несколько секунд забираем свои обращения: ответы специалиста и статусы.
 * Доска остаётся «своей» у каждого пользователя; сервер — место встречи с поддержкой.
 */

const S = () => useBoard.getState();
const POLL_VISIBLE = 4000;
const POLL_HIDDEN = 20000;
const PUSH_DELAY = 600;

const pushed = new Map<string, string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function signature(t: Task, msgs: Message[] | undefined): string {
  const e = t.escalation!;
  return [
    e.rev ?? 0,
    e.status,
    msgs?.length ?? 0,
    msgs?.at(-1)?.id ?? '',
    t.title,
    t.urgentRequest?.at ?? '',
  ].join('|');
}

function schedulePush(taskId: string) {
  if (timers.has(taskId)) return;
  timers.set(
    taskId,
    setTimeout(() => {
      timers.delete(taskId);
      void push(taskId);
    }, PUSH_DELAY),
  );
}

async function push(taskId: string) {
  const t = S().tasks[taskId];
  if (!t?.escalation) return;
  const msgs = S().messages[taskId] ?? [];
  const sig = signature(t, msgs);
  pushed.set(taskId, sig);
  try {
    const ticket = await serverApi.pushTicket({
      taskId,
      title: t.title,
      escalation: t.escalation,
      // специалисту — только сводка и сообщения после передачи, разговор с ИИ остаётся у человека
      messages: messagesForSpecialist(msgs, t.escalation),
      // просьба «Срочно» с причиной — специалист видит её как просьбу (ТЗ v4.16)
      urgent: t.urgentRequest ?? null,
    });
    await apply(ticket);
  } catch {
    // не дошло — попробуем при следующем изменении или опросе
    pushed.delete(taskId);
  }
}

/** Применить состояние обращения с сервера к своей задаче. */
async function apply(ticket: Ticket) {
  const t = S().tasks[ticket.taskId];
  if (!t?.escalation) return;
  const have = new Set((S().messages[ticket.taskId] ?? []).map((m) => m.id));
  for (const r of ticket.replies)
    if (!have.has(`reply-${r.id}`)) await agent.receiveSpecialistReply(ticket.taskId, r);

  const local = S().tasks[ticket.taskId]?.escalation;
  if (!local) return;
  const srv = ticket.escalation;
  const newer =
    (srv.rev ?? 0) > (local.rev ?? 0) ||
    ((srv.rev ?? 0) === (local.rev ?? 0) && srv.status !== local.status);
  if (newer) await agent.receiveEscalationStatus(ticket.taskId, srv);
}

async function poll() {
  try {
    const mine = await serverApi.myTickets();
    const known = new Set(mine.map((t) => t.taskId));
    for (const ticket of mine) await apply(ticket);
    // переданные, но не дошедшие до сервера (например, пропадал интернет) — отправим
    for (const t of Object.values(S().tasks))
      if (t.escalation && !known.has(t.id)) schedulePush(t.id);
  } catch {
    /* нет связи — следующий опрос */
  }
}

/** Запустить после загрузки доски; возвращает функцию остановки. */
export function startTicketSync(): () => void {
  // уже переданные считаем отправленными — сервер их знает (проверит опрос)
  for (const t of Object.values(S().tasks))
    if (t.escalation) pushed.set(t.id, signature(t, S().messages[t.id]));

  const unsub = useBoard.subscribe((state, prev) => {
    if (state.tasks === prev.tasks && state.messages === prev.messages) return;
    for (const t of Object.values(state.tasks)) {
      if (!t.escalation) continue;
      if (state.tasks[t.id] === prev.tasks[t.id] && state.messages[t.id] === prev.messages[t.id])
        continue;
      if (signature(t, state.messages[t.id]) !== pushed.get(t.id)) schedulePush(t.id);
    }
  });

  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const loop = async () => {
    if (stopped) return;
    await poll();
    if (stopped) return;
    timer = setTimeout(
      () => void loop(),
      document.visibilityState === 'visible' ? POLL_VISIBLE : POLL_HIDDEN,
    );
  };
  void loop();
  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      clearTimeout(timer);
      void loop();
    }
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    stopped = true;
    clearTimeout(timer);
    unsub();
    document.removeEventListener('visibilitychange', onVisible);
    for (const x of timers.values()) clearTimeout(x);
    timers.clear();
    pushed.clear();
  };
}
