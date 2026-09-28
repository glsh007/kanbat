import { useBoard } from '@/features/board/store';
import { cn } from '@/lib/cn';
import { useLlmStatus } from './llmStatus';

/** Одна строка в меню: подключён ли ИИ. Подробности и выбор модели — в «Настройках». */
export function AiStatusLine() {
  const { status, offline } = useLlmStatus();
  const model = useBoard((s) => s.settings.model);
  const ok = status?.provider === 'ollama' || status?.provider === 'openai';
  const name =
    ok && status ? (model && status.models.includes(model) ? model : status.model) : null;
  const text = offline
    ? 'ИИ: сервер не отвечает'
    : !status
      ? 'ИИ: проверяю…'
      : ok
        ? `ИИ подключён · ${name}`
        : status.demo
          ? 'ИИ: демо-режим'
          : 'ИИ недоступен';
  return (
    <p className="flex items-center gap-2 px-3 text-xs text-fg-muted" role="status">
      <span
        aria-hidden
        className={cn(
          'size-2 shrink-0 rounded-full',
          ok ? 'bg-accent' : 'border border-line-strong',
        )}
      />
      <span className="truncate">{text}</span>
    </p>
  );
}
