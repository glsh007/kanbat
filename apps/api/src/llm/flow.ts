import type { ChatMessage, Triage, TriageRoute } from './types';

/**
 * Выбор пути обращения после разбора (ТЗ v4.27). Одно правило для живых обращений (браузер берёт
 * `route` из ответа разбора) и для прогона проверочных вопросов — прогон показывает то, что увидит человек.
 */
export function routeOf(tr: Triage & { canned?: unknown }): TriageRoute {
  if (tr.meaningful === false) return 'describe';
  // готовый ответ организации подошёл по смыслу — дословно, без уточнений (ТЗ v4.25)
  if (tr.canned) return 'canned';
  // срочное с обходным путём — без вопросов; иначе — вопросы только по недостающему
  if (tr.missing.length && !(tr.urgency === 'critical' && tr.mode === 'steps')) return 'clarify';
  return afterClarify(tr);
}

/** Куда идти, когда данных достаточно (после уточнений или без них). */
export const afterClarify = (tr: Triage): TriageRoute =>
  tr.mode === 'escalate' ? 'specialist' : 'answer';

const ASK =
  'Передать ему обращение? Он получит короткую сводку — пересказывать ничего не придётся.';

/** Точка в конце фразы администратора, если её нет. */
const withStop = (s: string) => (/[.!?…]$/.test(s) ? s : s + '.');

/**
 * Реплика помощника с предложением передать специалисту (ТЗ v4.21, v4.26): по правилу «Сразу
 * к специалисту» — пояснение администратора; иначе — «самому не исправить». Передаёт человек сам.
 */
export function offerText(tr: Triage): string {
  if (tr.rules?.some((r) => r.action === 'specialist')) {
    const note = tr.rule_note?.trim();
    return `${note ? withStop(note) : 'С таким вопросом поможет специалист.'} ${ASK}`;
  }
  return `Похоже, тут без специалиста не обойтись: самому это не исправить. ${ASK}`;
}

const SERVICE_ASK = 'Ответь по существу на моё обращение';

/** Текст обращения из переписки: реплики человека, без служебной «Ответь по существу…». */
export function requestText(history: ChatMessage[]): string {
  return history
    .filter((m) => m.role === 'user' && !m.content.startsWith(SERVICE_ASK))
    .map((m) => m.content)
    .join('\n')
    .slice(0, 4000);
}

/** История для ответа по существу — как в браузере (answerHistory): обращение, разбор, просьба ответить. */
export function answerHistory(text: string, tr: Triage): ChatMessage[] {
  return [
    { role: 'user', content: text },
    {
      role: 'assistant',
      content: `Разбор: ${tr.summary}. Сервис: ${tr.service}. Срочность: ${tr.urgency}.`,
    },
    { role: 'user', content: `${SERVICE_ASK} выше (с учётом разбора).` },
  ];
}
