import { BadRequestException } from '@nestjs/common';
import { maskPersonalData } from '../common/pii';
import { overlap, safeLinks } from './answers';

/**
 * Образцы ответов организации (ТЗ v4.27, п. 17, шаг 3): пара «вопрос → хороший ответ». Образец учит
 * помощника, как здесь принято отвечать (тон, длина, что обязательно упомянуть), но человеку
 * дословно не показывается — ИИ пишет свой ответ. В инструкцию попадают до 2 самых похожих
 * на обращение образцов: длинная инструкция замедляет локальную модель.
 */
export interface AnswerSample {
  id: string;
  question: string;
  /** Хороший ответ (Markdown). */
  answer: string;
  enabled: boolean;
  updatedAt: string;
  updatedBy: string;
}

export const SAMPLE_LIMITS = {
  samples: 20,
  question: 300,
  answer: 2000,
  /** Сколько образцов подставлять в ответ. */
  perAnswer: 2,
} as const;

function text(v: unknown, max: number, field: string): string {
  const s = typeof v === 'string' ? v.replace(/\r/g, '').trim() : '';
  if (!s) throw new BadRequestException(`${field}: заполните`);
  if (s.length > max) throw new BadRequestException(`${field}: не длиннее ${max} символов`);
  return s;
}

export function cleanSample(raw: unknown): Pick<AnswerSample, 'question' | 'answer' | 'enabled'> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  // в образцах, как и везде, где текст видит модель, — без личных данных
  const question = maskPersonalData(text(r.question, SAMPLE_LIMITS.question, 'Вопрос')).text;
  const answer = safeLinks(
    maskPersonalData(text(r.answer, SAMPLE_LIMITS.answer, 'Хороший ответ')).text,
  );
  return { question, answer, enabled: r.enabled !== false };
}

/**
 * Самые похожие на обращение образцы: хотя бы одно общее значимое слово с вопросом образца
 * (в любой форме); больше общих слов — выше; при равенстве — большая доля слов вопроса.
 */
export function pickSamples(
  query: string,
  samples: AnswerSample[],
  n: number = SAMPLE_LIMITS.perAnswer,
): AnswerSample[] {
  if (!query.trim()) return [];
  return samples
    .filter((s) => s.enabled)
    .map((s) => ({ s, o: overlap(query, s.question) }))
    .filter((x) => x.o.found > 0)
    .sort(
      (a, b) =>
        b.o.found - a.o.found || b.o.found / (b.o.total || 1) - a.o.found / (a.o.total || 1),
    )
    .slice(0, n)
    .map((x) => x.s);
}

/** Блок инструкции с образцами — пусто, если образцов нет. */
export function samplesBlock(list: Pick<AnswerSample, 'question' | 'answer'>[]): string {
  if (!list.length) return '';
  const items = list
    .map((s, i) => `Образец ${i + 1}.\nВопрос: «${s.question}»\nХороший ответ:\n${s.answer}`)
    .join('\n\n');
  return `

ОБРАЗЦЫ ОТВЕТОВ ОРГАНИЗАЦИИ — так здесь принято отвечать на похожие вопросы.
Бери из них тон, длину, построение и обязательные сведения (адреса, сроки, названия разделов).
Отвечай на вопрос ЧЕЛОВЕКА своими словами: если его вопрос о другом — образец не копируй.
Не упоминай, что у тебя есть образцы.

${items}`;
}
