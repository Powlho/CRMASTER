#!/usr/bin/env bash
#
# Met à niveau la configuration Nginx d'une installation existante de CRMASTER :
#   - envois jusqu'à 500 Mo (import de fichiers audio ; Nginx refuse tout envoi > 1 Mo
#     par défaut) ;
#   - délai de réponse de 300 s (60 s par défaut).
# Sans effet si c'est déjà en place. La configuration d'origine est sauvegardée et remise
# en place si Nginx la refuse. À lancer en root :
#   cd /opt/crmaster && sudo bash deploy/fix-nginx.sh

set -euo pipefail

CONF="${NGINX_CONF:-/etc/nginx/sites-available/crmaster}"
if [[ ! -f "$CONF" ]]; then
  echo "Pas de configuration Nginx CRMASTER ($CONF) : rien à faire."
  exit 0
fi

BACKUP="$CONF.bak-$(date +%Y%m%d-%H%M%S)"
cp "$CONF" "$BACKUP"
CHANGED=0

if ! grep -q "client_max_body_size" "$CONF"; then
  sed -i -E 's/^([[:space:]]*)server[[:space:]]*\{[[:space:]]*$/&\n\1    client_max_body_size 500M;/' "$CONF"
  CHANGED=1
fi

if ! grep -q "proxy_read_timeout" "$CONF"; then
  sed -i -E 's/^([[:space:]]*)location \/ \{[[:space:]]*$/&\n\1    proxy_read_timeout 300s;\n\1    proxy_send_timeout 300s;/' "$CONF"
  CHANGED=1
fi

if [[ $CHANGED -eq 0 ]]; then
  rm -f "$BACKUP"
  echo "Configuration Nginx déjà à jour."
  exit 0
fi

if [[ "${SKIP_NGINX_RELOAD:-}" == "1" ]]; then
  echo "Configuration modifiée (rechargement ignoré)."
  exit 0
fi

if nginx -t; then
  systemctl reload nginx
  echo "==> Nginx mis à jour (sauvegarde : $BACKUP)."
else
  cp "$BACKUP" "$CONF"
  echo "Nginx a refusé la nouvelle configuration : l'ancienne a été remise en place." >&2
  exit 1
fi
