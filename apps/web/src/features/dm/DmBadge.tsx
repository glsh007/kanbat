import { useDm } from './store';

/** Счётчик в меню: непрочитанные сообщения и входящие запросы на переписку. */
export function DmBadge() {
  const u = useDm((s) => s.unread);
  if (!u.total) return null;
  const label = [
    u.messages ? `непрочитанных сообщений: ${u.messages}` : '',
    u.requests ? `запросов на переписку: ${u.requests}` : '',
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <span
      title={label}
      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-on-primary tabular-nums"
    >
      <span className="sr-only">{label}. Всего: </span>
      {u.total}
    </span>
  );
}
