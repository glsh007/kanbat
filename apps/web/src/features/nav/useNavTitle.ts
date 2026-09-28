import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { setEntryTitle } from './history';

/** Экран называет себя для подсказки стрелок: «Назад: обращение „VPN не подключается“». */
export function useNavTitle(title: string | null | undefined) {
  const { pathname, search } = useLocation();
  useEffect(() => {
    if (title) setEntryTitle(`${pathname}${search}`, title);
  }, [title, pathname, search]);
}
