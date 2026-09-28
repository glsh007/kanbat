import { CloudOff } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAiAvailable, useLlmStatus } from './llmStatus';

/**
 * Честное предупреждение: ИИ сейчас недоступен. Обращения всё равно принимаются —
 * с готовыми инструкциями по частым вопросам и передачей специалисту.
 */
export function AiUnavailableBanner({ className }: { className?: string }) {
  const available = useAiAvailable();
  const offline = useLlmStatus((s) => s.offline);
  if (available !== false) return null;
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-card border border-line bg-sunken px-3.5 py-3 text-sm',
        className,
      )}
    >
      <CloudOff size={18} aria-hidden className="mt-0.5 shrink-0 text-fg-muted" />
      <p>
        <span className="font-medium text-heading">
          {offline ? 'Нет связи с сервером Канбата.' : 'ИИ-помощник сейчас недоступен.'}
        </span>{' '}
        <span className="text-fg-muted">
          {offline
            ? 'Проверьте интернет — мы переподключимся сами.'
            : 'Обращения принимаются: подскажем готовые инструкции по частым вопросам или передадим специалисту.'}
        </span>
      </p>
    </div>
  );
}
