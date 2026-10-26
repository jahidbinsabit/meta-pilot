#!/usr/bin/env bash
#
# MetaCSV — one-shot VPS deploy (run as root, e.g. in CyberPanel terminal)
#
#   curl -fsSL https://raw.githubusercontent.com/jahidbinsabit/meta-pilot/main/deploy-vps.sh | bash
#
# Does: installs Docker, clones/updates the repo, creates .env with generated
# secrets, builds + starts app + Postgres + Redis, installs the two cron jobs.
# HTTPS: if ports 80/443 are free, Caddy serves the domain with automatic SSL.
# If CyberPanel/OpenLiteSpeed already owns 80/443, the script deploys the app
# stack only and prints the CyberPanel reverse-proxy steps instead.
#
set -euo pipefail

DOMAIN="metacsv.reflecters.com"
APP_DIR="/opt/metapilot"
REPO="https://github.com/jahidbinsabit/meta-pilot.git"
COMPOSE="docker compose -f docker-compose.prod.yml"

echo "=== [1/7] Docker ==="
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker 2>/dev/null || true
else
  echo "docker already installed: $(docker --version)"
fi

echo "=== [2/7] Code ==="
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch -q origin
  git -C "$APP_DIR" reset -q --hard origin/main
  echo "repo updated to $(git -C "$APP_DIR" rev-parse --short HEAD)"
else
  git clone -q "$REPO" "$APP_DIR"
  echo "repo cloned"
fi
cd "$APP_DIR"

echo "=== [3/7] .env ==="
set_kv() { # $1=key $2=value — replace existing line or append
  local key="$1" val="$2"
  if grep -qE "^${key}=" .env 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" .env
  else
    printf '%s=%s\n' "$key" "$val" >> .env
  fi
}
if [ ! -f .env ]; then
  cp .env.example .env
  DB_PASSWORD="$(openssl rand -hex 24)"
  AUTH_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
  CRON_SECRET="$(openssl rand -hex 32)"
  set_kv DOMAIN                  "$DOMAIN"
  set_kv DB_PASSWORD             "$DB_PASSWORD"
  set_kv AUTH_SECRET             "$AUTH_SECRET"
  set_kv NEXTAUTH_SECRET         "$AUTH_SECRET"
  set_kv CRON_SECRET             "$CRON_SECRET"
  set_kv NEXTAUTH_URL            "https://$DOMAIN"
  set_kv NEXT_PUBLIC_APP_URL     "https://$DOMAIN"
  echo ".env created with generated DB_PASSWORD / AUTH_SECRET / CRON_SECRET"
else
  echo ".env already exists — keeping it (edit $APP_DIR/.env to change values)"
fi

# Prefer local file storage unless a real S3 endpoint is configured.
# (The .env.example ships a localhost MinIO placeholder that breaks uploads
# on a prod VPS with no MinIO running.)
if ! grep -qE "^USE_LOCAL_STORAGE=" .env 2>/dev/null; then
  S3EP="$(grep -E "^S3_ENDPOINT=" .env 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'")"
  if [ -z "$S3EP" ] || [[ "$S3EP" == *"localhost"* ]] || [[ "$S3EP" == *"127.0.0.1"* ]]; then
    set_kv USE_LOCAL_STORAGE "true"
    echo "USE_LOCAL_STORAGE=true (no real S3 endpoint configured)"
  fi
fi

echo "=== [4/7] DNS check ==="
RESOLVED="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)"
if [ -z "$RESOLVED" ]; then
  echo "WARNING: $DOMAIN does not resolve yet — add an A record to this VPS IP first."
  echo "         HTTPS will not work until DNS propagates."
else
  echo "DNS: $DOMAIN -> $RESOLVED"
fi

echo "=== [5/7] Deploy ==="
PORTS_BUSY=""
ss -ltn 2>/dev/null | grep -qE ':80\s'  && PORTS_BUSY="80 $PORTS_BUSY"  || true
ss -ltn 2>/dev/null | grep -qE ':443\s' && PORTS_BUSY="443 $PORTS_BUSY" || true
if [ -z "$PORTS_BUSY" ]; then
  echo "ports 80/443 free — starting full stack incl. Caddy (auto HTTPS)"
  $COMPOSE up -d --build
  USE_CADDY=1
else
  echo "ports $PORTS_BUSY already in use (likely CyberPanel/OpenLiteSpeed)"
  echo "starting app + db + redis only (no Caddy)"
  $COMPOSE up -d --build app db redis
  USE_CADDY=0
fi

echo "=== [6/7] Cron jobs ==="
CRON_SECRET="$(grep -E '^CRON_SECRET=' .env | cut -d= -f2 || true)"
( crontab -l 2>/dev/null | grep -v "api/cron/" || true
  echo "0 0 * * * curl -s -H \"Authorization: Bearer ${CRON_SECRET}\" http://127.0.0.1:3100/api/cron/daily-credits >/dev/null 2>&1"
  # Uploads are temporary by design (owner's policy): delete every 30 min.
  # The endpoint itself only deletes files older than 5 minutes (TTL).
  echo "*/30 * * * * curl -s -H \"Authorization: Bearer ${CRON_SECRET}\" http://127.0.0.1:3100/api/cron/cleanup-uploads >/dev/null 2>&1"
) | crontab -
echo "crons installed (daily-credits 00:00, cleanup-uploads every 30 min)"

echo "=== [7/7] Image cleanup ==="
# Every --build leaves the previous app image behind as a dangling layer
# set; without this they pile up until the VPS disk fills. Dangling ONLY —
# never `prune -a`: tagged images (db, redis, caddy) must stay.
docker image prune -f >/dev/null 2>&1 || true
echo "dangling docker images pruned"

echo ""
echo "================= DONE ================="
if [ "$USE_CADDY" = "1" ]; then
  echo "App: https://$DOMAIN  (SSL automatic once DNS points here)"
else
  cat <<EOF
App stack is running on 127.0.0.1:3100 — expose it via CyberPanel:

  1. CyberPanel -> Websites -> Create Website: $DOMAIN
  2. Websites -> $DOMAIN -> vHost Conf, add at the top:
       extprocessor nodebackend {
         type            proxy
         address         127.0.0.1:3100
         maxConns        200
         pcKeepAliveTimeout 60
       }
       context / {
         type            proxy
         handler         nodebackend
         addDefaultCharset off
       }
  3. Save, then Websites -> $DOMAIN -> SSL -> Issue SSL (Let's Encrypt)
  4. Open https://$DOMAIN
EOF
fi
echo ""
echo "Optional features need keys in $APP_DIR/.env, then restart the app:"
echo "  GEMINI_API_KEY or OPENAI_API_KEY  (AI generation)"
echo "  GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (Google login; email login works already)"
echo "  STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
echo "  S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY / S3_BUCKET (file uploads)"
echo "  SMTP_* (emails)"
echo "After editing: cd $APP_DIR && $COMPOSE up -d --build app"
echo "Status: cd $APP_DIR && $COMPOSE ps"
echo "Logs:   cd $APP_DIR && $COMPOSE logs -f app"
