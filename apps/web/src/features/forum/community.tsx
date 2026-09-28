import type { CommunityIconKey } from '@app/shared';
import { HelpCircle } from 'lucide-react';
import { Logo } from '@/brand/Logo';
import { cn } from '@/lib/cn';
import { COMMUNITY_ICON_MAP } from './communityIcons';

/** Аватар сообщества: значок в круге; «все сообщества» (без значка) — летучая мышь. */
export function CommunityIcon({ icon, size = 32 }: { icon?: string | null; size?: number }) {
  const Icon = icon ? (COMMUNITY_ICON_MAP[icon as CommunityIconKey]?.icon ?? HelpCircle) : null;
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-full',
        Icon ? 'bg-accent-soft text-on-accent-soft' : 'bg-sunken ring-1 ring-line',
      )}
      style={{ width: size, height: size }}
    >
      {Icon ? (
        <Icon size={Math.round(size * 0.5)} />
      ) : (
        <Logo variant="mark" size={Math.round(size * 0.7)} decorative />
      )}
    </span>
  );
}
