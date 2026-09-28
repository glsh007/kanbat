import { useNavigate } from 'react-router';
import { Logo } from '@/brand/Logo';
import { Button } from '@/components/ui/Button';
import { GENERAL_SECTION_ID as DEFAULT_SECTION_ID } from '@app/shared';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <Logo variant="mark" size={48} decorative />
        <h1 className="text-xl">Такой страницы нет</h1>
        <p className="text-fg-muted">Возможно, раздел удалён или ссылка устарела.</p>
        <Button onClick={() => navigate(`/s/${DEFAULT_SECTION_ID}`)}>Вернуться к доске</Button>
      </div>
    </main>
  );
}
