/**
 * Контракт сервера: вход, доски пользователей, обращения к специалисту (ТЗ v3.4, п. 15).
 * Хранилище за интерфейсом — сейчас файл, на сервере в интернете — PostgreSQL.
 */
import type { Escalation, Message, UrgentRequest } from './domain';

export type UserRole = 'employee' | 'specialist';

export interface User {
  id: string;
  name: string;
  /** Ник (ТЗ v4.17): уникальный, по нему входят и находят друг друга. Нет — кабинет до регистрации. */
  username?: string;
  role: UserRole;
  /** IANA, например `Asia/Yekaterinburg` — для отложенной отправки (позже). */
  timezone?: string;
  /** Цветовая схема интерфейса (ТЗ v4.11); нет — схема по умолчанию. */
  scheme?: string;
  /** Администратор организации (ТЗ v4.12): вошёл с кодом администратора. */
  admin?: boolean;
  /** Метка аватарки (ТЗ v4.18): `preset:p3` или `photo:<версия>`; нет — буква имени. */
  avatar?: string;
  /** Есть ли фраза для восстановления доступа и когда создана (ТЗ v4.18). */
  hasRecovery?: boolean;
  recoveryAt?: string;
  /** Удалить аккаунт после года без входа (ТЗ v4.18). */
  autoDelete?: boolean;
  lastActiveAt?: string;
  /** Не принимать личные вопросы в Бат-общении (ТЗ v4.19). */
  dmOff?: boolean;
  /** Кого человек заблокировал в Бат-общении (id). */
  dmBlocked?: string[];
  createdAt: string;
}

export interface LoginRequest {
  name: string;
  role: UserRole;
  /** Код доступа специалиста (SUPPORT_CODE на сервере). */
  code?: string;
}

export interface LoginResult {
  token: string;
  user: User;
}

/** Сохранённое состояние доски пользователя (тот же формат, что у клиента). */
export interface BoardBlob {
  /** JSON-строка состояния клиента; сервер его не разбирает. */
  data: string;
  rev: number;
  updatedAt: string;
}

/** Ответ специалиста в обращении. */
export interface TicketReply {
  id: string;
  text: string;
  authorName: string;
  createdAt: string;
}

/**
 * Обращение у специалиста. Переписку и сводку присылает владелец задачи,
 * ответы и статусы — специалист. `escalation.rev` растёт при каждой смене статуса:
 * побеждает большая ревизия (при равной — сервер).
 */
export interface Ticket {
  id: string;
  taskId: string;
  ownerId: string;
  ownerName: string;
  title: string;
  escalation: Escalation;
  messages: Message[];
  replies: TicketReply[];
  /** Какой специалист взял обращение (null — пока никто). */
  takenBy?: { id: string; name: string } | null;
  /** Просьба «Срочно» от человека с причиной (ТЗ v4.16) — только просьба, на очередь не влияет. */
  urgent?: UrgentRequest | null;
  /** Переписка удалена по сроку хранения, осталась сводка (ТЗ v4.16). */
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Что присылает владелец задачи при передаче и при изменениях. */
export interface TicketPush {
  taskId: string;
  title: string;
  escalation: Escalation;
  messages: Message[];
  urgent?: UrgentRequest | null;
}

/**
 * Что из переписки видит специалист (ТЗ v4.4, п. 14): только сообщения человека **после передачи**.
 * Разговор с ИИ до передачи остаётся у человека — специалисту достаточно сводки из 6 пунктов.
 */
export function messagesForSpecialist(
  messages: readonly Message[],
  escalation: Pick<Escalation, 'createdAt'>,
): Message[] {
  return messages
    .filter(
      (m) =>
        m.role === 'user' && m.createdAt > escalation.createdAt && !m.stepReport && !m.answerTo,
    )
    .map((m) => ({
      id: m.id,
      taskId: m.taskId,
      role: 'user',
      kind: 'text',
      content: m.content,
      createdAt: m.createdAt,
    }));
}
