/**
 * Безопасная обёртка над localStorage: в приватном режиме или при запрете
 * хранилища обращение может бросить исключение — тогда просто работаем без него.
 */
export const safeStorage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* хранилище недоступно — настройка не сохранится между сессиями */
    }
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* хранилище недоступно */
    }
  },
};
