import type { Handoff } from '@app/shared';
import { Check, Copy } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { UrgencyBadge } from '@/components/ui/UrgencyBadge';
import { cn } from '@/lib/cn';
import { handoffToText } from './handoffText';

function Row({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[1.5rem_1fr] gap-x-2 gap-y-1">
      <span
        aria-hidden
        className="mt-0.5 inline-flex size-5 items-center justify-center rounded-full border border-line-strong text-xs text-fg-muted"
      >
        {n}
      </span>
      <div className="min-w-0">
        <h4 className="text-xs font-medium tracking-wide text-fg-muted uppercase">{title}</h4>
        <div className="mt-0.5 text-sm text-fg">{children}</div>
      </div>
    </div>
  );
}

export function CopyHandoff({ handoff, title }: { handoff: Handoff; title: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        void navigator.clipboard?.writeText(handoffToText(handoff, title)).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        })
      }
      className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2 text-xs text-fg-muted transition-colors duration-200 hover:bg-accent-soft hover:text-fg"
    >
      {done ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      {done ? 'Скопировано' : 'Скопировать сводку'}
    </button>
  );
}

/**
 * Сводка для специалиста из 6 пунктов кейса (ТЗ v2, п. 13.6).
 * Одна и та же — в чате пользователя и на доске специалиста.
 */
export function HandoffSummary({ handoff, className }: { handoff: Handoff; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <UrgencyBadge urgency={handoff.urgency} showAll />
        <span className="text-fg-muted">{handoff.service}</span>
      </div>
      <Row n={1} title="Исходное обращение">
        <p className="whitespace-pre-wrap">«{handoff.original}»</p>
      </Row>
      <Row n={2} title="Вопросы и ответы">
        {handoff.qa.length ? (
          <ul className="flex flex-col gap-0.5">
            {handoff.qa.map((x, i) => (
              <li key={i}>
                <span className="text-fg-muted">{x.q}</span> → {x.a}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-fg-muted">Не понадобились</span>
        )}
      </Row>
      <Row n={3} title="Предполагаемая проблема">
        {handoff.hypothesis || '—'}
      </Row>
      <Row n={4} title="Уже сделано">
        {handoff.actions.length ? (
          <ul className="list-disc pl-4">
            {handoff.actions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        ) : (
          <span className="text-fg-muted">Ничего не делали</span>
        )}
      </Row>
      <Row n={5} title="Текущий результат">
        {handoff.result || '—'}
      </Row>
      <Row n={6} title="Важно знать">
        {handoff.notes || <span className="text-fg-muted">—</span>}
      </Row>
    </div>
  );
}
