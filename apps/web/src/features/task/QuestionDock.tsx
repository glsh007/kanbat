import { ArrowUp, PenLine } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useId, useRef, useState } from 'react';
import { IconButton } from '@/components/ui/IconButton';
import { cn } from '@/lib/cn';

type Props = {
  /** «Вопрос 1 из 2»; null — встречный вопрос помощника без номера. */
  counter: string | null;
  question: string;
  options: string[];
  busy: boolean;
  onAnswer: (text: string) => void;
  /** «Пропустить» — только у вопросов уточнения (есть следующий шаг). */
  onSkip?: () => void;
  /** «Ответить без уточнений» — помощник отвечает с тем, что известно. */
  onSkipAll: () => void;
};

/**
 * Панель ответа на вопрос помощника — внизу, на месте поля ввода (ТЗ v4.14, как в Claude):
 * вопрос, пронумерованные варианты (клавиши 1–4), последним пунктом — «Свой ответ» с полем ввода,
 * чтобы сразу было видно: можно ответить своими словами. Ниже — «Пропустить» и «Ответить без уточнений».
 */
export function QuestionDock({
  counter,
  question,
  options,
  busy,
  onAnswer,
  onSkip,
  onSkipAll,
}: Props) {
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const inputId = useId();

  // новый вопрос — пустое поле
  useEffect(() => setText(''), [question]);

  const send = (value: string) => {
    const v = value.trim();
    if (!v || busy) return;
    onAnswer(v);
    setText('');
  };

  // 1–4 — выбрать вариант, где бы ни был фокус, кроме полей ввода (как в Claude)
  const pick = useRef(send);
  pick.current = send;
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      if (el?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      const n = Number(e.key);
      if (n >= 1 && n <= options.length) {
        e.preventDefault();
        pick.current(options[n - 1]!);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [options]);

  return (
    <motion.section
      aria-labelledby={titleId}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
      className="flex flex-col gap-2 rounded-[20px] border border-line-strong bg-surface p-3 shadow-card"
    >
      <div className="px-1">
        {counter && <p className="text-xs text-fg-muted">{counter}</p>}
        <h3 id={titleId} className="text-[15px] font-medium text-heading">
          {question}
        </h3>
      </div>

      {options.length > 0 && (
        <ol className="flex flex-col gap-1" aria-label="Варианты ответа">
          {options.map((o, i) => (
            <li key={o}>
              <button
                type="button"
                disabled={busy}
                onClick={() => send(o)}
                aria-keyshortcuts={String(i + 1)}
                className={cn(
                  'flex min-h-11 w-full items-center gap-3 rounded-control px-2 text-left text-[15px] text-fg',
                  'transition-colors duration-200 hover:bg-accent-soft focus-visible:bg-accent-soft disabled:opacity-50',
                  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
                )}
              >
                <span
                  aria-hidden
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-[8px] border border-line bg-sunken text-sm text-fg-muted tabular-nums"
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">{o}</span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {/* свой ответ — последним пунктом, чтобы было видно: вариантами ответ не ограничен */}
      <form
        className="flex items-center gap-3 rounded-control px-2 focus-within:bg-sunken"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <span
          aria-hidden
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-[8px] border border-line bg-sunken text-fg-muted"
        >
          <PenLine size={14} />
        </span>
        <label htmlFor={inputId} className="sr-only">
          Свой ответ
        </label>
        <input
          id={inputId}
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={options.length ? 'Свой ответ…' : 'Ваш ответ…'}
          autoComplete="off"
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-muted"
        />
        <IconButton
          type="submit"
          size="sm"
          label="Отправить ответ"
          icon={<ArrowUp size={18} />}
          disabled={busy || !text.trim()}
          className={cn(text.trim() && 'bg-primary text-on-primary hover:bg-primary-hover')}
        />
      </form>

      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 px-1 pt-1">
        {onSkip && (
          <button
            type="button"
            disabled={busy}
            onClick={onSkip}
            className="min-h-9 text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline disabled:opacity-50"
          >
            Пропустить вопрос
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={onSkipAll}
          className="min-h-9 text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline disabled:opacity-50"
        >
          Ответить без уточнений
        </button>
      </div>
    </motion.section>
  );
}
