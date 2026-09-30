import { BadRequestException } from '@nestjs/common';
import { maskPersonalData } from '../common/pii';

/**
 * Разбор ошибок (ТЗ v4.29, п. 17, шаг 4): ответ помощника, который не помог, человек по своему согласию
 * показывает администратору — только свой вопрос и этот ответ. Администратор превращает его
 * в проверочный вопрос, образец или правило.
 */
export type ReviewReason = 'not_helped' | 'rework';

export interface ErrorReview {
  id: string;
  question: string;
  answer: string;
  reason: ReviewReason;
  /** Что человек написал вместе с «Не помогло» / «Доработать». */
  note: string;
  status: 'new' | 'done';
  /** Что сделали: проверочный вопрос, образец, правило или просто закрыли. */
  outcome: 'check' | 'sample' | 'rule' | 'closed' | null;
  createdAt: string;
  /** Кто прислал — только для ограничения частоты, администратору не показываем. */
  from: string;
}

export const REVIEW_LIMITS = {
  keep: 200,
  perUserPerDay: 20,
  question: 2000,
  answer: 6000,
  note: 500,
};

const text = (v: unknown, max: number) =>
  maskPersonalData(typeof v === 'string' ? v.replace(/\r/g, '').trim().slice(0, max) : '').text;

export function cleanReview(
  raw: unknown,
): Pick<ErrorReview, 'question' | 'answer' | 'reason' | 'note'> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const question = text(r.question, REVIEW_LIMITS.question);
  const answer = text(r.answer, REVIEW_LIMITS.answer);
  if (!question || !answer) throw new BadRequestException('Нужны вопрос и ответ помощника');
  return {
    question,
    answer,
    reason: r.reason === 'rework' ? 'rework' : 'not_helped',
    note: text(r.note, REVIEW_LIMITS.note),
  };
}

/** Администратору — без отправителя. */
export const reviewView = ({ from: _from, ...r }: ErrorReview) => r;
