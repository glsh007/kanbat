import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

/** Адрес картинки аватарки: метка версии в адресе сбрасывает кэш, когда аватарку меняют. */
const avatarUrl = (userId: string, avatar: string) =>
  `/api/avatars/${encodeURIComponent(userId)}?v=${encodeURIComponent(avatar)}`;

/**
 * Аватарка (ТЗ v4.18): фото или готовый рисунок, если он есть; иначе — первая буква имени.
 * Декоративная: имя всегда написано рядом, поэтому скринридеру картинка не нужна.
 */
export function Avatar({
  name,
  userId,
  avatar,
  size = 40,
  className,
}: {
  name: string;
  userId?: string;
  /** Метка аватарки из профиля (`preset:p3`, `photo:…`); нет — буква имени. */
  avatar?: string;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [userId, avatar]);

  if (userId && avatar && !broken)
    return (
      <img
        src={avatarUrl(userId, avatar)}
        alt=""
        aria-hidden
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        style={{ width: size, height: size }}
        className={cn('shrink-0 rounded-full bg-sunken object-cover ring-1 ring-line', className)}
      />
    );
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-on-accent-soft',
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
