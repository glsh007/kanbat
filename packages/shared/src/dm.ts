import type { UserRole } from './server';

/**
 * Бат-общение (ТЗ v4.19, п. 18): личный вопрос по теме Бат-Форума тому, кто в ней отвечал.
 * Кто начал — спрашивает, кто принял — помогает. Переписка живёт до 3 дней тишины и не дольше
 * 7 дней, затем уходит в архив каждого (в его кабинете). ИИ и специалисты её не читают.
 */

/** Что видно о человеке другим. */
export interface DmProfile {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  /** Метка аватарки (ТЗ v4.18): картинка — `/api/avatars/<id>?v=<метка>`. */
  avatar?: string;
}

/** pending — вопрос ждёт ответа; active — идёт переписка. Закрытые — только в архиве. */
export type DmStatus = 'pending' | 'active';
/** Кто я в этой переписке: спрашиваю или помогаю. */
export type DmRole = 'seeker' | 'helper';
/** Тема Бат-Форума, по которой переписка. */
export interface DmTopic {
  id: string;
  title: string;
}

/** Переписка в списке Бат-общения. */
export interface DmChatCard {
  id: string;
  with: DmProfile;
  topic: DmTopic;
  role: DmRole;
  status: DmStatus;
  /** Можно писать: вопрос принят. */
  canWrite: boolean;
  last: { text: string; mine: boolean; at: string } | null;
  unread: number;
  lastAt: string;
  /** Когда закроется сама: 3 дня без сообщений или 7 дней с начала — что раньше. */
  closesAt: string;
  /** Что наступит раньше: тишина или общий срок. */
  closesBy: 'quiet' | 'total';
}

export interface DmMessageView {
  id: string;
  text: string;
  mine: boolean;
  createdAt: string;
}

export interface DmUnread {
  messages: number;
  requests: number;
  total: number;
}

/** Почему переписка закрыта. */
export type DmCloseReason =
  | 'solved' // спрашивающий: «Проблема решена»
  | 'helper_ended' // помогающий: «Больше помочь не могу»
  | 'quiet' // 3 дня без сообщений
  | 'total' // 7 дней с начала
  | 'declined' // вопрос не приняли
  | 'unanswered' // вопрос не приняли за 3 дня
  | 'blocked' // один заблокировал другого
  | 'legacy'; // переписка до v4.19, без темы

export const DM_CLOSE_LABELS: Record<DmCloseReason, string> = {
  solved: 'Проблема решена',
  helper_ended: 'Помогающий завершил переписку',
  quiet: 'Закрыта: 3 дня без сообщений',
  total: 'Закрыта: прошло 7 дней',
  declined: 'Вопрос не приняли',
  unanswered: 'Вопрос остался без ответа',
  blocked: 'Закрыта',
  legacy: 'Переписка до обновления — без темы',
};

/** Переписка в архиве — копия в кабинете, видна только владельцу. */
export interface DmArchiveCard {
  id: string;
  with: DmProfile;
  topic: DmTopic | null;
  role: DmRole;
  reason: DmCloseReason;
  startedAt: string;
  closedAt: string;
  count: number;
  last: { text: string; mine: boolean } | null;
  /** Можно ли спросить этого человека снова по той же теме. */
  canAskAgain: boolean;
}

export interface DmArchiveView extends DmArchiveCard {
  messages: DmMessageView[];
}

/** Профиль человека (из имени автора на Бат-Форуме). */
export interface DmProfileView {
  profile: DmProfile;
  me: boolean;
  /** Принимает ли личные вопросы по темам. */
  open: boolean;
  blockedByMe: boolean;
}

/** Жалоба на переписку — для специалиста в «На проверке». */
export interface DmReportView {
  id: string;
  chatId: string;
  reporterName: string;
  reportedName: string;
  reason: string;
  messages: { text: string; createdAt: string }[];
  createdAt: string;
}
