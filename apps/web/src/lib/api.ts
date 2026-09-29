import type {
  AnswerOutcome,
  ChatMessage,
  ClassifyResult,
  HandoffResult,
  LlmCheck,
  LlmStatus,
  PlanResult,
  QuestionsResult,
  SectionRef,
  SortItem,
  SortResult,
  StepsResult,
  StepReplyResult,
  PlanStep,
  StreamMode,
  Triage,
  Ticket,
  TicketPush,
  SupportTimers,
  SpecialistRef,
  CloseReason,
  ForumDraft,
  ForumSection,
  ForumSort,
  ForumThreadPage,
  ForumThreadView,
  CommunityDraft,
  CommunityProposal,
  CommunitySuggestion,
  ForumReview,
  ForumReviewCount,
  ReportReason,
  OrgProfile,
  OrgState,
  DmChatCard,
  DmMessageView,
  DmArchiveCard,
  DmArchiveView,
  DmProfileView,
  DmReportView,
  DmUnread,
} from '@app/shared';
import { authHeaders, sessionExpired } from './session';

/** Ошибка API с понятным пользователю текстом. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Тело ответа с ошибкой (например, текущая доска при конфликте 409). */
    readonly data?: unknown,
  ) {
    super(message);
  }
}

const OFFLINE = 'Сервер Канбата не отвечает. Проверьте интернет или что Канбат запущен.';

/**
 * Запрос к API с токеном входа. 401 — сессия недействительна: возвращаем на экран входа.
 */
export async function request<T>(
  method: string,
  url: string,
  body?: unknown,
  signal?: AbortSignal,
  keepalive = false,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...authHeaders(),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
      keepalive,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(OFFLINE);
  }
  if (res.status === 401) {
    sessionExpired();
    throw new ApiError('Войдите заново', 401);
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(data?.message ?? `Ошибка сервера (${res.status})`, res.status, data);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/llm/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(OFFLINE);
  }
  if (res.status === 401) {
    sessionExpired();
    throw new ApiError('Войдите заново', 401);
  }
  if (res.status === 404) {
    // Сайт новее сервера: запущен старый API (например, из прошлой папки проекта)
    throw new ApiError(
      'Сервер приложения старой версии. Закройте все окна cmd и запустите npm run dev в папке новой версии.',
    );
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(data?.message ?? `Ошибка сервера (${res.status})`);
  }
  return (await res.json()) as T;
}

export const api = {
  async status(refresh = false): Promise<LlmStatus> {
    const res = await fetch(`/api/llm/status${refresh ? '?refresh=1' : ''}`);
    if (!res.ok) throw new ApiError(`Ошибка сервера (${res.status})`);
    return (await res.json()) as LlmStatus;
  },
  classify: (text: string, model: string | null, signal?: AbortSignal) =>
    post<ClassifyResult>('classify', { text, model }, signal),
  questions: (messages: ChatMessage[], hard: boolean, model: string | null, signal?: AbortSignal) =>
    post<QuestionsResult>('questions', { messages, hard, model }, signal),
  plan: (
    messages: ChatMessage[],
    feedback: string | undefined,
    model: string | null,
    signal?: AbortSignal,
  ) => post<PlanResult>('plan', { messages, feedback, model }, signal),
  /** Разложить задачи по разделам по смыслу (ТЗ v3.3, п. 5). */
  sort: (sections: SectionRef[], items: SortItem[], model: string | null, signal?: AbortSignal) =>
    post<SortResult>('sort', { sections, items, model }, signal),
  // режим поддержки (ТЗ v2, п. 13)
  triage: (text: string, messages: ChatMessage[], model: string | null, signal?: AbortSignal) =>
    post<Triage>('triage', { text, messages, model }, signal),
  supportQuestions: (
    messages: ChatMessage[],
    focus: string[],
    urgent: boolean,
    model: string | null,
    signal?: AbortSignal,
  ) => post<QuestionsResult>('support-questions', { messages, focus, urgent, model }, signal),
  steps: (
    messages: ChatMessage[],
    urgent: boolean,
    attempt: number,
    model: string | null,
    signal?: AbortSignal,
  ) => post<StepsResult>('steps', { messages, urgent, attempt, model }, signal),
  /** Ответ человека на шаг своими словами (ТЗ v4.21): реакция и итог. */
  stepReply: (
    messages: ChatMessage[],
    plan: PlanStep[],
    index: number,
    urgent: boolean,
    model: string | null,
    signal?: AbortSignal,
  ) =>
    post<StepReplyResult>(
      'step-reply',
      {
        messages,
        plan: plan.map((p) => ({
          title: p.title,
          instruction: p.instruction ?? '',
          check: p.check ?? '',
          result: p.result,
        })),
        index,
        urgent,
        model,
      },
      signal,
    ),
  handoff: (messages: ChatMessage[], model: string | null, signal?: AbortSignal) =>
    post<HandoffResult>('handoff', { messages, model }, signal),
  /** Проверка скорости ИИ: короткий ответ модели и где она работает. */
  check: (model: string | null, signal?: AbortSignal) => post<LlmCheck>('check', { model }, signal),
};

export type StreamHandlers = {
  onMeta?: (meta: { model: string | null }) => void;
  /** Чем закончился ответ: этап и кнопки по смыслу (ТЗ v4.13). */
  onOutcome?: (outcome: AnswerOutcome) => void;
  onToken: (text: string) => void;
  onStep?: (n: number) => void;
};

/**
 * Стриминг ответа: POST + чтение text/event-stream вручную
 * (EventSource умеет только GET, а нам нужно тело с историей).
 * Возвращает итоговый текст.
 */
export async function streamReply(
  body: {
    messages: ChatMessage[];
    mode: StreamMode;
    plan?: string[];
    model: string | null;
    /** Оценить ответ (этап + кнопки) — событие outcome перед done. */
    assess?: boolean;
  },
  h: StreamHandlers,
  signal: AbortSignal,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch('/api/llm/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(OFFLINE);
  }
  if (res.status === 401) {
    sessionExpired();
    throw new ApiError('Войдите заново', 401);
  }
  if (!res.ok || !res.body) throw new ApiError(`Ошибка сервера (${res.status})`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  let final: string | null = null;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const event = /^event: (.+)$/m.exec(block)?.[1];
      const raw = /^data: (.+)$/m.exec(block)?.[1];
      if (!event || !raw) continue;
      const data = JSON.parse(raw) as Record<string, unknown>;
      if (event === 'meta') h.onMeta?.({ model: (data.model as string | null) ?? null });
      else if (event === 'token') {
        full += String(data.t ?? '');
        h.onToken(full);
      } else if (event === 'reset') {
        // показанное оказалось рассуждениями модели — заменяем текст целиком
        full = String(data.text ?? '');
        h.onToken(full);
      } else if (event === 'step') h.onStep?.(Number(data.n));
      else if (event === 'outcome') h.onOutcome?.(data as unknown as AnswerOutcome);
      else if (event === 'done') final = String(data.text ?? full);
      else if (event === 'error') throw new ApiError(String(data.message ?? 'Ошибка модели'));
    }
  }
  if (final === null) throw new ApiError('Ответ оборвался. Попробуйте ещё раз.');
  return final;
}

// ——— Доска и обращения к специалисту (сервер, ТЗ v3.4, п. 15) ———

export const serverApi = {
  getBoard: (signal?: AbortSignal) =>
    request<{ board: { data: string; rev: number } | null }>(
      'GET',
      '/api/board',
      undefined,
      signal,
    ),
  /** baseRev — версия, поверх которой сохраняем; при расхождении сервер ответит 409 и своей доской. */
  putBoard: (data: string, baseRev: number | null, keepalive = false) =>
    request<{ rev: number }>(
      'PUT',
      '/api/board',
      { data, ...(baseRev !== null ? { baseRev } : {}) },
      undefined,
      keepalive,
    ),

  pushTicket: (t: TicketPush) => request<Ticket>('POST', '/api/support/tickets', t),
  myTickets: () => request<Ticket[]>('GET', '/api/support/mine'),

  // специалист
  tickets: () => request<Ticket[]>('GET', '/api/support/tickets'),
  take: (id: string) => request<Ticket>('POST', `/api/support/tickets/${id}/take`, {}),
  reply: (id: string, text: string) =>
    request<Ticket>('POST', `/api/support/tickets/${id}/reply`, { text }),
  // ТЗ v4.22: «Отметить решённым» больше нет — закрывает человек или срок
  release: (id: string) => request<Ticket>('POST', `/api/support/tickets/${id}/release`, {}),
  close: (id: string, reason: CloseReason, note: string) =>
    request<Ticket>('POST', `/api/support/tickets/${id}/close`, { reason, note }),
  assign: (id: string, specialistId: string | null) =>
    request<Ticket>('POST', `/api/support/tickets/${id}/assign`, { specialistId }),
  specialists: () => request<SpecialistRef[]>('GET', '/api/support/specialists'),
  supportSettings: () => request<SupportTimers>('GET', '/api/support/settings'),
  saveSupportSettings: (t: Partial<SupportTimers>) =>
    request<SupportTimers>('PUT', '/api/support/settings', t),
};

// ——— Мини-форум (ТЗ v4.2, п. 16) ———

const q = (params: Record<string, string | undefined>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) u.set(k, v);
  const s = u.toString();
  return s ? `?${s}` : '';
};

export const forumApi = {
  sections: () => request<ForumSection[]>('GET', '/api/forum/sections'),
  threads: (p: { section?: string; sort?: ForumSort; q?: string }, signal?: AbortSignal) =>
    request<ForumThreadView[]>('GET', `/api/forum/threads${q(p)}`, undefined, signal),
  similar: (text: string, signal?: AbortSignal) =>
    request<ForumThreadView[]>('GET', `/api/forum/similar${q({ q: text })}`, undefined, signal),
  thread: (id: string) => request<ForumThreadPage>('GET', `/api/forum/threads/${id}`),
  create: (t: ForumDraft & { fromRequest?: boolean }) =>
    request<ForumThreadView>('POST', '/api/forum/threads', t),
  reply: (id: string, body: string) =>
    request<ForumThreadPage>('POST', `/api/forum/threads/${id}/replies`, { body }),
  voteThread: (id: string) => request<ForumThreadPage>('POST', `/api/forum/threads/${id}/vote`, {}),
  voteReply: (id: string) => request<ForumThreadPage>('POST', `/api/forum/replies/${id}/vote`, {}),
  solution: (id: string, replyId: string | null) =>
    request<ForumThreadPage>('POST', `/api/forum/threads/${id}/solution`, { replyId }),
  pin: (id: string, pinned: boolean) =>
    request<ForumThreadPage>('POST', `/api/forum/threads/${id}/pin`, { pinned }),
  move: (id: string, sectionId: string) =>
    request<ForumThreadPage>('POST', `/api/forum/threads/${id}/move`, { sectionId }),
  lock: (id: string, locked: boolean) =>
    request<ForumThreadPage>('POST', `/api/forum/threads/${id}/lock`, { locked }),
  rename: (id: string, title: string) =>
    request<ForumThreadPage>('POST', `/api/forum/threads/${id}/title`, { title }),
  report: (id: string, reason: ReportReason, note?: string) =>
    request<{ reported: boolean; hidden: boolean }>('POST', `/api/forum/threads/${id}/report`, {
      reason,
      note,
    }),
  dismissReports: (id: string) =>
    request<ForumThreadPage>('POST', `/api/forum/threads/${id}/reports/dismiss`, {}),
  removeThread: (id: string) => request<void>('DELETE', `/api/forum/threads/${id}`),
  removeReply: (id: string) => request<ForumThreadPage>('DELETE', `/api/forum/replies/${id}`),
  /** Подсказка сообщества для новой темы: ИИ или совпадение слов. */
  suggest: (title: string, body: string, model: string | null, signal?: AbortSignal) =>
    request<CommunitySuggestion>('POST', '/api/llm/forum-suggest', { title, body, model }, signal),

  // сообщества (v4.7)
  createSection: (d: CommunityDraft) =>
    request<
      | { status: 'active'; section: ForumSection }
      | { status: 'proposed'; proposal: CommunityProposal }
    >('POST', '/api/forum/sections', d),
  updateSection: (id: string, d: CommunityDraft) =>
    request<ForumSection[]>('POST', `/api/forum/sections/${id}`, d),
  archiveSection: (id: string) =>
    request<{ moved: number }>('POST', `/api/forum/sections/${id}/archive`, {}),
  proposals: () => request<CommunityProposal[]>('GET', '/api/forum/proposals'),
  approve: (id: string, d?: Partial<CommunityDraft>) =>
    request<ForumSection>('POST', `/api/forum/proposals/${id}/approve`, d ?? {}),
  reject: (id: string, note: string) =>
    request<CommunityProposal>('POST', `/api/forum/proposals/${id}/reject`, { note }),

  // «На проверке» (специалист)
  review: () => request<ForumReview>('GET', '/api/forum/review'),
  reviewCount: () => request<ForumReviewCount>('GET', '/api/forum/review/count'),
};

/** Профиль организации (ТЗ v4.12). */
export const orgApi = {
  get: () => request<OrgState>('GET', '/api/org'),
  save: (profile: OrgProfile) => request<OrgState>('PUT', '/api/org', { profile }),
  /** Пробный ответ по черновику профиля (ещё не сохранённому). */
  preview: (profile: OrgProfile, question: string, model?: string | null, signal?: AbortSignal) =>
    request<{ model: string | null; reply: string }>(
      'POST',
      '/api/llm/org-preview',
      { profile, question, model },
      signal,
    ),
};

/** Личные сообщения (ТЗ v4.17). */
export const dmApi = {
  profile: (key: string) =>
    request<DmProfileView>('GET', `/api/dm/profile/${encodeURIComponent(key)}`),
  chats: () => request<DmChatCard[]>('GET', '/api/dm/chats'),
  unread: () => request<DmUnread>('GET', '/api/dm/unread'),
  /** «Спросить лично» / «Спросить снова»: тема, человек, вопрос (ТЗ v4.19). */
  ask: (threadId: string, userId: string, text: string) =>
    request<DmChatCard>('POST', '/api/dm/requests', { threadId, userId, text }),
  accept: (id: string) => request<DmChatCard>('POST', `/api/dm/chats/${id}/accept`),
  decline: (id: string) => request<{ ok: true }>('POST', `/api/dm/chats/${id}/decline`),
  solve: (id: string) => request<{ archiveId: string | null }>('POST', `/api/dm/chats/${id}/solve`),
  end: (id: string) => request<{ archiveId: string | null }>('POST', `/api/dm/chats/${id}/end`),
  block: (id: string) => request<{ archiveId: string | null }>('POST', `/api/dm/chats/${id}/block`),
  unblock: (userId: string) => request<{ ok: true }>('POST', `/api/dm/users/${userId}/unblock`),
  remove: (id: string) => request<{ ok: true }>('DELETE', `/api/dm/chats/${id}`),
  messages: (id: string) =>
    request<{ chat: DmChatCard; messages: DmMessageView[] }>('GET', `/api/dm/chats/${id}/messages`),
  send: (id: string, text: string) =>
    request<DmMessageView>('POST', `/api/dm/chats/${id}/messages`, { text }),
  report: (id: string, reason: string) =>
    request<{ ok: true; archiveId: string | null }>('POST', `/api/dm/chats/${id}/report`, {
      reason,
    }),
  archive: () => request<DmArchiveCard[]>('GET', '/api/dm/archive'),
  archived: (id: string) => request<DmArchiveView>('GET', `/api/dm/archive/${id}`),
  removeArchived: (id: string) => request<{ ok: true }>('DELETE', `/api/dm/archive/${id}`),
  reports: () => request<DmReportView[]>('GET', '/api/dm/reports'),
  resolveReport: (id: string) => request<unknown>('POST', `/api/dm/reports/${id}/resolve`),
};
