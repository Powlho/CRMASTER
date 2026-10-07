#!/usr/bin/env bash
#
# Réglages Nginx de CRMASTER : envois jusqu'à 2 Go (Nginx refuse tout envoi > 1 Mo par
# défaut) et délais de 600 s. Posés dans un fichier dédié du bloc http, les anciennes valeurs
# du site (qui prendraient le dessus) sont retirées. La configuration d'origine est remise
# en place si Nginx la refuse. À lancer en root :
#   cd /opt/crmaster && sudo bash deploy/nginx-uploads.sh
#
# Note : derrière Cloudflare, chaque requête est de toute façon limitée à 100 Mo ; l'app
# envoie les fichiers par morceaux pour rester sous cette limite.

set -euo pipefail

SITE="${NGINX_CONF:-/etc/nginx/sites-available/crmaster}"
GLOBAL=/etc/nginx/conf.d/crmaster-uploads.conf

BACKUP_DIR="$(mktemp -d)"
[[ -f "$SITE" ]] && cp "$SITE" "$BACKUP_DIR/site"
[[ -f "$GLOBAL" ]] && cp "$GLOBAL" "$BACKUP_DIR/global"

cat > "$GLOBAL" <<'NGINX'
client_max_body_size 2G;
proxy_read_timeout 600s;
proxy_send_timeout 600s;
NGINX

if [[ -f "$SITE" ]]; then
  sed -i '/^\s*\(client_max_body_size\|proxy_read_timeout\|proxy_send_timeout\)\s/d' "$SITE"
fi

if [[ "${SKIP_NGINX_RELOAD:-}" == "1" ]]; then
  echo "Configuration modifiée (rechargement ignoré)."
  exit 0
fi

if nginx -t; then
  systemctl reload nginx
  echo "==> Nginx : envois jusqu'à 2 Go, délais de 600 s."
  rm -rf "$BACKUP_DIR"
else
  [[ -f "$BACKUP_DIR/site" ]] && cp "$BACKUP_DIR/site" "$SITE"
  if [[ -f "$BACKUP_DIR/global" ]]; then cp "$BACKUP_DIR/global" "$GLOBAL"; else rm -f "$GLOBAL"; fi
  echo "Nginx a refusé la nouvelle configuration : l'ancienne a été remise en place." >&2
  exit 1
fi
