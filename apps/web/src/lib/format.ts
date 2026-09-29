const timeFmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Короткий обратный отсчёт: «через 45 мин», «через 2 ч 10 мин». */
export function formatCountdown(targetIso: string, now: number): string {
  const ms = new Date(targetIso).getTime() - now;
  if (ms <= 60_000) return 'меньше минуты';
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `через ${m} мин`;
  if (h < 24) return m ? `через ${h} ч ${m} мин` : `через ${h} ч`;
  const d = Math.floor(h / 24);
  return `через ${d} дн ${h % 24} ч`;
}

/** Когда уйдёт задача: «сегодня в 18:30», «завтра в 09:00», «пн, 28 сент. в 09:00». */
export function formatWhen(targetIso: string, now: number): string {
  const t = new Date(targetIso);
  const today = new Date(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const time = timeFmt.format(t);
  if (sameDay(t, today)) return `сегодня в ${time}`;
  if (sameDay(t, tomorrow)) return `завтра в ${time}`;
  return `${dayFmt.format(t)} в ${time}`;
}

/** «1 вопрос», «2 вопроса», «5 вопросов». */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** «только что», «5 мин назад», «3 ч назад», «вчера», «12 сент.». */
export function timeAgo(iso: string, now: number): string {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч назад`;
  if (h < 48) return 'вчера';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(iso));
}

/** «28 сентября 2026» — дата без времени. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d
        .toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
        .replace(/\s*г\.$/, '');
}
