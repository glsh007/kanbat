import { useEffect, useState } from 'react';

/** Текущее время, обновляемое раз в `intervalMs` — для обратного отсчёта на карточках. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}
