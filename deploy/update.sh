#!/usr/bin/env bash
# Обновить Канбат на сервере: сначала загрузите новый kanbat.zip в /root (scp), затем:
#   bash /root/kanbat/deploy/update.sh
# Настройки (.env) и данные (data) не трогаются; перед обновлением — копия данных.
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ZIP="${1:-/root/kanbat.zip}"
cd "$APP_DIR"
bash deploy/backup.sh
if [ -f "$ZIP" ]; then
  TMP=$(mktemp -d)
  unzip -q "$ZIP" -d "$TMP"
  SRC="$TMP/kanbat"; [ -d "$SRC" ] || SRC="$TMP"
  # код заменяем целиком, настройки и данные — оставляем
  find "$APP_DIR" -mindepth 1 -maxdepth 1 ! -name .env ! -name data -exec rm -rf {} +
  cp -a "$SRC"/. "$APP_DIR"/
  rm -rf "$TMP"
  mv "$ZIP" "$ZIP.installed-$(date +%F-%H%M)"
  echo "Код обновлён из $ZIP"
else
  echo "Архив $ZIP не найден — пересобираю текущий код"
fi
chmod +x deploy/*.sh
docker compose up -d --build
for _ in $(seq 1 60); do
  if docker compose exec -T kanbat wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "✓ Канбат обновлён и работает"; docker image prune -f >/dev/null; exit 0
  fi
  sleep 2
done
docker compose logs --tail 40 kanbat
echo "✗ Канбат не запустился — выше журнал. Вернуть данные: см. deploy/backup.sh"
exit 1
