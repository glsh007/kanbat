import { BRAND } from './brand';
import { TEAM_NAME, TeamMark } from './TeamMark';
import { cn } from '@/lib/cn';

/** Тихая подпись авторов — как «Claude made by Anthropic»: внизу меню и на экране входа. */
export function MadeBy({ className }: { className?: string }) {
  return (
    <p className={cn('flex items-center gap-1.5 text-xs text-fg-muted', className)}>
      <span>{BRAND.name} made by</span>
      <TeamMark size={16} />
      <span className="font-medium">{TEAM_NAME}</span>
    </p>
  );
}
