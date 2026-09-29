import { create } from 'zustand';
import { safeStorage } from './storage';

/**
 * Размер интерфейса (ТЗ v4.18): 90–130 %. Меняет корневой размер шрифта — всё, что задано в rem
 * (текст, отступы, кнопки), растёт вместе с ним. Хранится на этом устройстве: на телефоне и
 * ноутбуке удобен разный размер.
 */
export const UI_SCALES = [90, 100, 115, 130] as const;
export type UiScale = (typeof UI_SCALES)[number];
const KEY = 'kc-ui-scale';

function read(): UiScale {
  const v = Number(safeStorage.get(KEY));
  return (UI_SCALES as readonly number[]).includes(v) ? (v as UiScale) : 100;
}

export function applyUiScale(v: UiScale) {
  document.documentElement.style.fontSize = v === 100 ? '' : `${v}%`;
}

export const useUiScale = create<{ scale: UiScale; set: (v: UiScale) => void }>()((set) => ({
  scale: read(),
  set: (v) => {
    safeStorage.set(KEY, String(v));
    applyUiScale(v);
    set({ scale: v });
  },
}));

/** Вызывается до первой отрисовки — без «прыжка» размера. */
export const initUiScale = () => applyUiScale(read());
