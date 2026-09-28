import { ArrowUp } from 'lucide-react';
import { useId, useState } from 'react';
import { EXAMPLES } from '@/features/board/examples';
import { SimilarThreads } from '@/features/forum/SimilarThreads';
import { cn } from '@/lib/cn';

/**
 * Главное действие сотрудника: описать проблему своими словами.
 * Всё поле — одна «карточка», как у современных ИИ-чатов; Enter — отправить, Shift+Enter — перенос.
 * hero — крупное поле по центру экрана; compact — вверху списка на телефоне.
 */
export function RequestComposer({
  onSubmit,
  variant = 'compact',
}: {
  onSubmit: (text: string) => void;
  variant?: 'hero' | 'compact';
}) {
  const [text, setText] = useState('');
  const id = useId();
  const hero = variant === 'hero';

  const submit = () => {
    const clean = text.trim();
    if (!clean) return;
    onSubmit(clean);
    setText('');
  };

  return (
    <div className="flex flex-col gap-3">
      <form
        className={cn(
          'flex flex-col gap-2 border border-line bg-surface transition-[border-color,box-shadow] duration-200',
          'focus-within:border-line-strong focus-within:shadow-raised',
          hero ? 'rounded-[20px] p-4 shadow-raised' : 'rounded-panel p-3 shadow-card',
        )}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor={id} className="sr-only">
          Опишите проблему
        </label>
        <textarea
          id={id}
          rows={hero ? 3 : 2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Опишите проблему своими словами — как написали бы коллеге"
          className={cn(
            'w-full resize-none bg-transparent text-fg outline-none placeholder:text-fg-muted focus-visible:outline-none',
            hero ? 'text-[17px] leading-relaxed' : 'text-[15px] leading-relaxed',
          )}
        />
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 text-xs text-fg-muted">Enter — отправить</p>
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Отправить"
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-full bg-primary text-on-primary transition-[background-color,opacity,transform] duration-200',
              'hover:bg-primary-hover active:translate-y-px disabled:opacity-40',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            )}
          >
            <ArrowUp size={18} aria-hidden />
          </button>
        </div>
      </form>
      {/* пока человек пишет — похожие темы форума: вдруг ответ уже есть */}
      <SimilarThreads text={text} />
      <div
        className={cn('flex flex-wrap items-center gap-1.5', hero && 'justify-center')}
        aria-label="Примеры обращений"
      >
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            title={ex.text}
            onClick={() => setText(ex.text)}
            className="min-h-8 rounded-full border border-line px-3 text-xs text-fg-muted transition-colors duration-200 hover:border-line-strong hover:text-fg"
          >
            {ex.label}
          </button>
        ))}
      </div>
    </div>
  );
}
