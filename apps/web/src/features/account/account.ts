import { stopSaving } from '@/features/board/serverStorage';
import { request } from '@/lib/api';
import { useSession } from '@/lib/session';

/**
 * Удалить свой аккаунт: сервер стирает пользователя, его доску, входы на всех устройствах
 * и обращения к специалисту. Сначала выключаем сохранение, чтобы доска не записалась обратно.
 */
export async function deleteAccount(): Promise<void> {
  await stopSaving();
  await request<void>('DELETE', '/api/auth/me');
  useSession.getState().set(null);
}
