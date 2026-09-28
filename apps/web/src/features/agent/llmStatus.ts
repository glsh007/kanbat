import type { LlmStatus } from '@app/shared';
import { create } from 'zustand';
import { api } from '@/lib/api';

type State = {
  status: LlmStatus | null;
  /** Сервер приложения (NestJS) недоступен. */
  offline: boolean;
  loading: boolean;
  refresh: (force?: boolean) => Promise<void>;
};

/** Состояние подключения к модели: Ollama / демо-режим / сервер не запущен. */
export const useLlmStatus = create<State>((set) => ({
  status: null,
  offline: false,
  loading: false,
  refresh: async (force = false) => {
    set({ loading: true });
    try {
      const status = await api.status(force);
      set({ status, offline: false, loading: false });
    } catch {
      set({ offline: true, loading: false });
    }
  },
}));

/**
 * Доступен ли ИИ прямо сейчас. Нет модели и сервер не в демо-режиме — работаем честно без ИИ:
 * частые вопросы и передача специалисту (ТЗ v4.1, п. 13.8).
 */
export function aiAvailable(): boolean {
  const { status, offline } = useLlmStatus.getState();
  if (offline || !status) return false;
  return status.provider !== 'mock' || !!status.demo;
}

/** То же, но как хук — для плашки «ИИ недоступен». null — ещё не знаем. */
export const useAiAvailable = (): boolean | null =>
  useLlmStatus((s) =>
    s.offline ? false : !s.status ? null : s.status.provider !== 'mock' || !!s.status.demo,
  );

/** Перед важным шагом: узнать состояние, если ещё не знаем. */
export async function ensureStatus(): Promise<void> {
  if (!useLlmStatus.getState().status) await useLlmStatus.getState().refresh();
}

let timer: number | undefined;
/** Опрос раз в 20 секунд: пользователь может запустить Ollama, пока приложение открыто. */
export function startStatusPolling() {
  if (timer) return;
  void useLlmStatus.getState().refresh();
  timer = window.setInterval(() => void useLlmStatus.getState().refresh(), 20_000);
}
