import type { ForumCommunity, ForumThread } from '../store/types';
import { relevance, stems } from './text';

/**
 * Подсказка сообщества без ИИ (ТЗ v4.7): совпадение слов с названием и описанием сообщества
 * и с темами, которые уже в нём есть. Возвращает id, только если победитель очевиден.
 */
export function suggestByWords(
  text: string,
  communities: Pick<ForumCommunity, 'id' | 'name' | 'description' | 'slug'>[],
  threads: Pick<ForumThread, 'sectionId' | 'title' | 'body'>[],
): string | null {
  const q = [...new Set(stems(text))];
  if (!q.length) return null;
  const scored = communities.map((c) => {
    const own = stems(`${c.name} ${c.description} ${c.slug}`);
    let score = 0;
    for (const w of q) if (own.some((x) => x.startsWith(w) || w.startsWith(x))) score += 3;
    // похожие темы в этом сообществе — сильный сигнал, но не больше 5 баллов
    let similar = 0;
    for (const t of threads) if (t.sectionId === c.id && relevance(t, q) >= 3) similar += 1;
    return { id: c.id, score: score + Math.min(5, similar) };
  });
  scored.sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  if (!best || best.score < 3) return null;
  if (second && second.score >= best.score) return null;
  return best.id;
}
