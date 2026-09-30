import { useEffect } from 'react';

/** Другие блоки «Организации» перечитывают данные, когда «Разбор ошибок» что-то добавил (ТЗ v4.29). */
export const ORG_CHANGED = 'kanbat:org-changed';
export const orgChanged = () => window.dispatchEvent(new Event(ORG_CHANGED));

/** Слушать изменения из «Разбора ошибок». */
export function useOrgChanged(fn: () => void) {
  useEffect(() => {
    window.addEventListener(ORG_CHANGED, fn);
    return () => window.removeEventListener(ORG_CHANGED, fn);
  }, [fn]);
}
