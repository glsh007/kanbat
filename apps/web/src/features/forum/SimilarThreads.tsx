import type { ForumThreadView } from '@app/shared';
import { CheckCircle2, MessagesSquare } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { forumApi } from '@/lib/api';
import { cn } from '@/lib/cn';

/**
 * «Похожие обсуждения на Бат-Форуме» — подсказка по тексту обращения:
 * часто ответ уже есть, и обращение создавать не нужно.
 */
export function SimilarThreads({ text, className }: { text: string; className?: string }) {
  const [items, setItems] = useState<ForumThreadView[]>([]);

  useEffect(() => {
    const q = text.trim();
    if (q.length < 12) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      forumApi
        .similar(q, ctrl.signal)
        .then(setItems)
        .catch(() => undefined);
    }, 450);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [text]);

  if (!items.length) return null;
  return (
    <section
      aria-label="Похожие обсуждения на Бат-Форуме"
      className={cn(
        'flex flex-col gap-1.5 rounded-card border border-line bg-surface p-3',
        className,
      )}
    >
      <h3 className="flex items-center gap-1.5 text-sm font-medium text-heading">
        <MessagesSquare size={16} aria-hidden />
        Похожие обсуждения на Бат-Форуме
      </h3>
      <ul className="flex flex-col">
        {items.map((t) => (
          <li key={t.id}>
            <Link
              to={`/forum/t/${t.id}`}
              className="flex items-start gap-2 rounded-[8px] px-1.5 py-1.5 text-sm transition-colors duration-200 hover:bg-sunken"
            >
              <span className="min-w-0 flex-1">{t.title}</span>
              {t.solved && (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-heading">
                  <CheckCircle2 size={13} aria-hidden /> решение
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
