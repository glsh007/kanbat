import { useCallback, useState } from 'react';
import { safeStorage } from './storage';

/**
 * Ширина панели, которую человек подвинул за край (ТЗ v4.18). Запоминается на этом устройстве
 * отдельно для каждой панели: чат на доске, список обращений, список переписок…
 */
export function usePanelWidth(key: string, def: number, min: number, max: number) {
  const storageKey = `kc-w-${key}`;
  const [width, setState] = useState(() => {
    const v = Number(safeStorage.get(storageKey));
    return Number.isFinite(v) && v >= min && v <= max ? v : def;
  });
  const setWidth = useCallback(
    (v: number) => {
      const next = Math.round(Math.min(max, Math.max(min, v)));
      setState(next);
      if (next === def) safeStorage.remove(storageKey);
      else safeStorage.set(storageKey, String(next));
    },
    [storageKey, def, min, max],
  );
  return { width, setWidth, min, max, def };
}
export type PanelWidth = ReturnType<typeof usePanelWidth>;
