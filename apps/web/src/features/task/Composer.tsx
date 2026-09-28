import { ArrowUp, Square } from 'lucide-react';
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { IconButton } from '@/components/ui/IconButton';
import { cn } from '@/lib/cn';

export type ComposerHandle = { focus: () => void };

type Props = {
  placeholder: string;
  busy: boolean;
  disabled?: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
};

/** Поле ввода чата: Enter — отправить, Shift+Enter — новая строка; во время ответа — «Стоп». */
export const Composer = forwardRef<ComposerHandle, Props>(function Composer(
  { placeholder, busy, disabled = false, onSend, onStop },
  ref,
) {
  const [text, setText] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  useImperativeHandle(ref, () => ({ focus: () => area.current?.focus() }), []);

  // авто-высота: от 1 до ~8 строк
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const send = () => {
    const t = text.trim();
    if (!t || busy || disabled) return;
    onSend(t);
    setText('');
  };

  return (
    <form
      className="flex items-end gap-2 rounded-[20px] border border-line bg-surface p-2 pl-4 shadow-card transition-[border-color,box-shadow] duration-200 focus-within:border-line-strong focus-within:shadow-raised"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <label htmlFor={id} className="sr-only">
        Сообщение
      </label>
      <textarea
        id={id}
        ref={area}
        rows={1}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        placeholder={placeholder}
        className="scroll-paper max-h-[200px] min-h-10 flex-1 resize-none bg-transparent py-2 text-[15px] text-fg outline-none placeholder:text-fg-muted focus-visible:outline-none disabled:opacity-60"
      />
      {busy ? (
        <IconButton
          label="Остановить ответ"
          icon={<Square size={16} fill="currentColor" />}
          onClick={onStop}
          className="rounded-full border border-line-strong"
        />
      ) : (
        <IconButton
          type="submit"
          label="Отправить"
          icon={<ArrowUp size={20} />}
          disabled={!text.trim() || disabled}
          className={cn(
            'rounded-full bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-40',
            'border border-primary-border',
          )}
        />
      )}
    </form>
  );
});
