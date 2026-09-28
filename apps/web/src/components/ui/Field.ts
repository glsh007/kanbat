/**
 * Общие классы полей ввода. Граница — border-strong (≥ 3:1 к фону и карточке, см. контраст),
 * фон — утопленная поверхность, как у столбцов.
 */
export const fieldClass =
  'w-full rounded-control border border-line-strong bg-sunken px-3 text-[15px] text-fg ' +
  'placeholder:text-fg-muted transition-[border-color,box-shadow] duration-200 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus';
