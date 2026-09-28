import { URGENCY_LABELS, type Handoff } from '@app/shared';

/** Сводка текстом — для копирования во внешнюю тикет-систему. */
export function handoffToText(h: Handoff, title: string): string {
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `  — ${x}`).join('\n') : '  —');
  return [
    `Обращение: ${title}`,
    `Сервис: ${h.service} · Срочность: ${URGENCY_LABELS[h.urgency]}`,
    '',
    `1. Исходное обращение:\n  «${h.original}»`,
    `2. Уточняющие вопросы и ответы:\n${h.qa.length ? h.qa.map((x) => `  — ${x.q} → ${x.a}`).join('\n') : '  —'}`,
    `3. Предполагаемая проблема:\n  ${h.hypothesis || '—'}`,
    `4. Уже выполненные действия:\n${list(h.actions)}`,
    `5. Текущий результат:\n  ${h.result || '—'}`,
    `6. Другая важная информация:\n  ${h.notes || '—'}`,
  ].join('\n');
}
