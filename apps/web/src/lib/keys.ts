import type { KeyboardEvent } from 'react';

/**
 * Отправить сообщение (ТЗ v4.28): Enter без Shift — во всех полях сообщений; Shift+Enter — новая строка.
 * Ctrl/Cmd+Enter по-прежнему отправляет. Пока идёт набор через IME (иероглифы, подсказки) — не отправляем.
 */
export const isSendKey = (e: KeyboardEvent<HTMLElement>) =>
  e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.nativeEvent.isComposing;

export const SEND_HINT = 'Enter — отправить, Shift+Enter — новая строка';
