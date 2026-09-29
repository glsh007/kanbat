#!/usr/bin/env bash
# Канбат на сервере — установка одной командой (Ubuntu 22.04 / 24.04, запускать от root):
#   cd /root/kanbat && bash deploy/install.sh
# Что делает: ставит Docker, спрашивает домен и ключ ИИ, запускает Канбат с HTTPS,
# проверяет ИИ и включает ежедневную копию данных. Повторный запуск безопасен.
set -euo pipefail

cd "$(dirname "$0")/.."
APP_DIR="$(pwd)"
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  ✓ %s\n' "$*"; }
warn() { printf '  ! %s\n' "$*"; }
die() { printf '\n✗ %s\n' "$*" >&2; exit 1; }
ask() { # ask "Вопрос" [по умолчанию] → ответ в REPLY
  local q="$1" def="${2:-}"
  if [ -n "$def" ]; then read -r -p "  $q [$def]: " REPLY </dev/tty || true; REPLY="${REPLY:-$def}"
  else read -r -p "  $q: " REPLY </dev/tty || true; fi
}

[ "$(id -u)" = 0 ] || die "Запустите от root: sudo bash deploy/install.sh"
[ -f docker-compose.yml ] || die "Не нашёл docker-compose.yml — запускайте из папки kanbat"
command -v apt-get >/dev/null || die "Нужна Ubuntu или Debian (apt-get)"

say "1/6 Подготовка сервера"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl unzip cron >/dev/null
ok "пакеты"

# Мало памяти — сборка сайта может не поместиться: добавляем файл подкачки 2 ГБ
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$MEM_MB" -lt 3000 ] && ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ok "файл подкачки 2 ГБ (памяти ${MEM_MB} МБ)"
fi

say "2/6 Docker"
if ! command -v docker >/dev/null; then
  apt-get install -y -qq docker.io >/dev/null 2>&1 || curl -fsSL https://get.docker.com | sh
fi
if ! docker compose version >/dev/null 2>&1; then
  apt-get install -y -qq docker-compose-v2 >/dev/null 2>&1 \
    || apt-get install -y -qq docker-compose-plugin >/dev/null 2>&1 \
    || {
      mkdir -p /usr/local/lib/docker/cli-plugins
      curl -fsSL "https://github.com/docker/compose/releases/download/v2.32.4/docker-compose-linux-$(uname -m)" \
        -o /usr/local/lib/docker/cli-plugins/docker-compose
      chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
    }
fi
docker compose version >/dev/null 2>&1 || die "Не удалось поставить docker compose"
# Docker Hub из России открывается не всегда — добавляем зеркала (если своих настроек нет)
if [ ! -s /etc/docker/daemon.json ]; then
  mkdir -p /etc/docker
  cat > /etc/docker/daemon.json <<'JSON'
{
  "registry-mirrors": ["https://mirror.gcr.io", "https://dockerhub.timeweb.cloud", "https://dh-mirror.gitverse.ru"],
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
JSON
  ok "зеркала Docker Hub"
fi
systemctl enable --now docker >/dev/null 2>&1 || true
systemctl restart docker
ok "$(docker --version)"

say "3/6 Настройки"
if [ -f .env ] && [ "${1:-}" != "--reconfigure" ]; then
  ok "файл .env уже есть — оставляю (заново: bash deploy/install.sh --reconfigure)"
else
  echo "  Домен — тот, что вы купили и направили на этот сервер (A-запись). Без https:// и слешей."
  ask "Домен сайта, например kanbat.ru"; DOMAIN="${REPLY#http*://}"; DOMAIN="${DOMAIN%%/*}"
  [ -n "$DOMAIN" ] || die "Домен обязателен"
  echo "  Yandex AI Studio: идентификатор каталога (b1g…) и API-ключ (секретная часть)."
  ask "Идентификатор каталога (YANDEX_FOLDER_ID)"; FOLDER="$REPLY"
  read -r -s -p "  API-ключ (при вводе не отображается): " KEY </dev/tty || true; echo
  [ -n "$FOLDER" ] && [ -n "$KEY" ] || warn "без каталога или ключа ИИ работать не будет — поправьте .env и запустите снова"
  CODE_DEFAULT=$(tr -dc '0-9' </dev/urandom | head -c 6 || true)
  ask "Код входа для специалистов" "$CODE_DEFAULT"; CODE="$REPLY"
  ADMIN_DEFAULT=$(tr -dc '0-9' </dev/urandom | head -c 8 || true)
  echo "  Код администратора открывает настройки помощника (роль, тон, правила). Дайте его только администратору."
  ask "Код администратора организации" "$ADMIN_DEFAULT"; ADMIN="$REPLY"
  [ "$ADMIN" != "$CODE" ] || die "Код администратора должен отличаться от кода специалиста"
  umask 077
  cat > .env <<ENV
DOMAIN=$DOMAIN
SUPPORT_CODE=$CODE
ADMIN_CODE=$ADMIN
LLM_PROVIDER=yandex
YANDEX_FOLDER_ID=$FOLDER
LLM_API_KEY=$KEY
LLM_MODEL=qwen3.6-35b-a3b
ENV
  umask 022
  ok "сохранено в $APP_DIR/.env (видно только root)"
fi
set -a; . ./.env; set +a

# Домен должен указывать на этот сервер — иначе HTTPS-сертификат не выдадут
MY_IP=$(curl -fsS --max-time 5 https://ipv4.internet.yandex.net/api/v0/ip 2>/dev/null | tr -d '"' \
  || curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)
DNS_IP=$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1 {print $1}' || true)
if [ -n "$MY_IP" ] && [ "$DNS_IP" = "$MY_IP" ]; then
  ok "домен $DOMAIN указывает на этот сервер ($MY_IP)"
else
  warn "домен $DOMAIN указывает на «${DNS_IP:-никуда}», а у сервера адрес ${MY_IP:-?}."
  warn "Проверьте A-запись у регистратора. Изменения DNS расходятся от 15 минут до нескольких часов;"
  warn "Канбат запустится сейчас, а HTTPS включится сам, когда домен заработает."
fi

# Брандмауэр: если включён — открываем веб и SSH
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443 >/dev/null
  ok "ufw: открыты 22, 80, 443"
fi

say "4/6 Сборка и запуск (первый раз — 3–8 минут)"
mkdir -p data
docker compose up -d --build
for i in $(seq 1 60); do
  if docker compose exec -T kanbat wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    ok "Канбат работает"; break
  fi
  sleep 2
  [ "$i" = 60 ] && { docker compose logs --tail 40 kanbat; die "Канбат не запустился — выше последние строки журнала"; }
done

say "5/6 Проверка ИИ"
docker compose exec -T kanbat node scripts/check-ai.mjs || warn "ИИ пока не отвечает — см. подсказку выше, поправьте .env и выполните: docker compose up -d"

say "6/6 Ежедневная копия данных"
chmod +x deploy/*.sh
cat > /etc/cron.d/kanbat-backup <<CRON
# Канбат: копия данных каждый день в 03:30, хранится 14 дней (/root/kanbat-backups)
30 3 * * * root $APP_DIR/deploy/backup.sh >/dev/null 2>&1
CRON
systemctl enable --now cron >/dev/null 2>&1 || true
ok "копии — в /root/kanbat-backups"

say "Готово!"
echo "  Сайт:               https://$DOMAIN"
echo "  Код специалиста:    ${SUPPORT_CODE}"
if [ -n "${ADMIN_CODE:-}" ]; then
  echo "  Код администратора: ${ADMIN_CODE}"
else
  echo "  Код администратора: в журнале — cd $APP_DIR && docker compose logs kanbat | grep администратора"
fi
echo "  Журнал:             cd $APP_DIR && docker compose logs -f kanbat"
echo "  Проверить ИИ:       cd $APP_DIR && docker compose exec kanbat node scripts/check-ai.mjs"
echo "  Обновить Канбат:    загрузите новый kanbat.zip в /root и выполните: bash $APP_DIR/deploy/update.sh"
echo "  Копия данных сейчас: bash $APP_DIR/deploy/backup.sh"
echo
echo "  Если сайт не открывается по https — подождите, пока заработает домен (до пары часов),"
echo "  сертификат Caddy получит сам. Проверка: docker compose logs caddy | tail"
