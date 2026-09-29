import type { PlanStep, StepOutcome, StepReplyResult } from '@app/shared';

/**
 * Разбор ответа на шаг по словам (ТЗ v4.21) — когда модель недоступна или ошиблась.
 * Такой же разбор есть на сервере (apps/api/src/llm/mock.ts, stepOutcomeByWords) — держите одинаковыми.
 */
export function stepOutcomeByWords(text: string): StepOutcome | null {
  const t = text.toLowerCase().replace(/ё/g, 'е').trim();
  if (!t) return null;
  if (/нет прав|не хватает прав|нет доступа|доступ запрещ|только админ|сломал|разбит|залил/.test(t))
    return 'specialist';
  if (/мига|оранжев|красн|вообще не в этом|дело не в|другая ошибка|появил|теперь пишет/.test(t))
    return 'other';
  if (
    /не помог|не получ|не вышл|не работ|не откр|не гор|не загор|не заработ|не пуска|не приход|не пришл|не отображ|не видно|так же|то же самое|ничего не|^нет(?![а-я])|без изменений/.test(
      t,
    )
  )
    return 'failed';
  if (/заработал|все работает|решен|решилось|проблема ушла|все получилось|все в порядке/.test(t))
    return 'solved';
  if (/^(я )?(сделал|сделала|сделал\(а\)|готово|выполнил|выполнила|ок|окей|done)[.!\s]*$/.test(t))
    return 'ask';
  if (/^да(?![а-я])|получилось|горит|открыл|открылась|работает|помогло|вышло|зелен|подключ/.test(t))
    return 'done';
  return null;
}

/** Человек не сказал, что получилось: «сделал», «готово», «ок» (ТЗ v4.23). Копия — в apps/api mock.ts. */
export function isBareAck(text: string): boolean {
  const t = text.toLowerCase().replace(/ё/g, 'е').trim();
  return (
    !t ||
    /^(я )?(сделал|сделала|сделал\(а\)|сделано|готово|выполнил|выполнила|ок|окей|ok|done|все|дальше)[.!\s]*$/.test(
      t,
    )
  );
}

/** Реплика без вопросов: когда идём дальше по плану, переспрашивать нечего. */
export function withoutQuestions(text: string): string {
  return (text.match(/[^.!?…]+[.!?…]*/g) ?? [])
    .filter((s) => !/\?\s*$/.test(s.trim()))
    .join('')
    .trim();
}

/**
 * Без модели новых шагов не выдумываем: «не помогло» — просто отмечаем шаг,
 * дальше идёт следующий шаг плана или предложение специалиста.
 */
export function localStepReply(text: string, plan: PlanStep[], index: number): StepReplyResult {
  const outcome = stepOutcomeByWords(text);
  const check = plan[index]?.check?.trim();
  switch (outcome) {
    case 'done':
      return { outcome, reply: '', step: null };
    case 'solved':
      return { outcome, reply: 'Отлично, рад, что всё заработало!', step: null };
    case 'specialist':
      return {
        outcome,
        reply: 'Здесь, похоже, нужен специалист: самому это не исправить.',
        step: null,
      };
    case 'failed':
    case 'other':
      return { outcome, reply: 'Понятно, этот шаг не помог.', step: null };
    case 'ask':
      return { outcome, reply: `Хорошо. ${check || 'Что получилось в итоге?'}`, step: null };
    default:
      return {
        outcome: 'ask',
        reply: `Не совсем понял. ${check || 'Шаг помог?'} Напишите, например, «получилось» или «не помогло».`,
        step: null,
      };
  }
}
