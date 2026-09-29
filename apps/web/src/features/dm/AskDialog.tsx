import { MessageCircleQuestion, ShieldCheck } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { fieldClass } from '@/components/ui/Field';
import { dmApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useDm } from './store';

const MIN = 5;
const MAX = 1000;

/**
 * «Спросить лично» (ТЗ v4.19): вопрос по теме Бат-Форума тому, кто в ней отвечал.
 * Человек сначала видит вопрос и тему и решает, принимать ли.
 */
export function AskDialog() {
  const ask = useDm((s) => s.ask);
  const close = useDm((s) => s.closeAsk);
  const refresh = useDm((s) => s.refresh);
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const hintId = useId();

  useEffect(() => {
    setText('');
    setError(null);
  }, [ask]);

  const send = async () => {
    if (!ask) return;
    const q = text.trim();
    if (q.length < MIN) return setError('Напишите вопрос — человек увидит его до того, как примет');
    setBusy(true);
    setError(null);
    try {
      const chat = await dmApi.ask(ask.threadId, ask.user.id, q);
      close();
      void refresh();
      navigate(`/messages/${chat.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!ask}
      onClose={close}
      title="Спросить лично"
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Отмена
          </Button>
          <Button
            icon={<MessageCircleQuestion size={16} />}
            disabled={busy}
            onClick={() => void send()}
          >
            {busy ? 'Отправляю…' : 'Задать вопрос'}
          </Button>
        </>
      }
    >
      {ask && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <div className="flex items-center gap-3">
            <Avatar name={ask.user.name} userId={ask.user.id} avatar={ask.user.avatar} size={40} />
            <div className="min-w-0">
              <p className="truncate font-medium text-heading">{ask.user.name}</p>
              <p className="truncate text-sm text-fg-muted">Тема: {ask.threadTitle}</p>
            </div>
          </div>
          <label htmlFor={id} className="text-sm font-medium text-heading">
            Ваш вопрос
          </label>
          <textarea
            id={id}
            rows={4}
            maxLength={MAX}
            value={text}
            aria-describedby={hintId}
            onChange={(e) => setText(e.target.value)}
            placeholder="Например: а где именно вы поменяли протокол? У меня такого пункта нет"
            className={cn(fieldClass, 'resize-y py-2 leading-snug')}
          />
          <p id={hintId} className="flex items-start gap-1.5 text-xs text-fg-muted">
            <ShieldCheck size={14} aria-hidden className="mt-px shrink-0" />
            Переписка — только про эту тему. Она закроется сама через 3 дня без сообщений или через
            7 дней, а копия останется в архиве у каждого. ИИ и специалисты её не читают.
          </p>
          {error && (
            <p role="alert" className="text-sm font-medium text-heading">
              {error}
            </p>
          )}
        </form>
      )}
    </Dialog>
  );
}
