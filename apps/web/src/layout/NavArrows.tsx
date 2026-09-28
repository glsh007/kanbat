import { Redo2, Undo2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { IconButton } from '@/components/ui/IconButton';
import { describePath, goToStep, useNavHistory } from '@/features/nav/history';
import { cn } from '@/lib/cn';

/**
 * Стрелки Канбата «Назад / Вперёд» по экранам (ТЗ v4.9, п. 11) — как «Отменить / Вернуть» в Ворде.
 * Подсказка говорит, куда вернёт; некуда — кнопка неактивна.
 */
export function NavArrows({ className }: { className?: string }) {
  const navigate = useNavigate();
  const entries = useNavHistory((s) => s.entries);
  const index = useNavHistory((s) => s.index);
  const prev = entries[index - 1];
  const next = entries[index + 1];
  const label = (dir: string, e?: { path: string; title?: string }) =>
    e ? `${dir}: ${e.title ?? describePath(e.path)}` : `${dir} — некуда`;

  return (
    <div role="group" aria-label="Переходы по экранам" className={cn('flex shrink-0', className)}>
      <IconButton
        size="sm"
        label={label('Назад', prev)}
        icon={<Undo2 size={18} />}
        disabled={!prev}
        onClick={() => goToStep(navigate, index - 1)}
      />
      <IconButton
        size="sm"
        label={label('Вперёд', next)}
        icon={<Redo2 size={18} />}
        disabled={!next}
        onClick={() => goToStep(navigate, index + 1)}
      />
    </div>
  );
}
