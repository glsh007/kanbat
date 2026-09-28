#!/usr/bin/env bash
# Копия данных Канбата (кабинеты, обращения, БатФорум): /root/kanbat-backups, хранится 14 дней.
# Восстановить: docker compose stop kanbat && tar -xzf <копия> -C <папка kanbat> && docker compose start kanbat
set -euo pipefail
cd "$(dirname "$0")/.."
DEST=/root/kanbat-backups
mkdir -p "$DEST"
FILE="$DEST/kanbat-$(date +%F-%H%M).tar.gz"
tar -czf "$FILE" data .env
chmod 600 "$FILE"
find "$DEST" -name 'kanbat-*.tar.gz' -mtime +14 -delete
echo "Копия: $FILE ($(du -h "$FILE" | cut -f1))"
