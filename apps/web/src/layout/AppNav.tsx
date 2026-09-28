import { useRole } from '@/features/board/store';
import { SectionNav } from './SectionNav';
import { SupportNav } from './SupportNav';

/** Меню по роли: у сотрудника — его разделы, у специалиста — очереди пульта поддержки. */
export function AppNav({ onNavigate }: { onNavigate?: () => void }) {
  return useRole() === 'specialist' ? (
    <SupportNav onNavigate={onNavigate} />
  ) : (
    <SectionNav onNavigate={onNavigate} />
  );
}
