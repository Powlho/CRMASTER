#!/usr/bin/env bash
#
# Autorise l'envoi de gros fichiers audio/vidéo (jusqu'à 2 Go) à travers Nginx.
# La limite par défaut de Nginx (1 Mo) bloque les enregistrements et les imports.
# Appelé par setup-vps.sh et update.sh ; peut aussi être lancé seul : sudo bash deploy/nginx-uploads.sh

set -euo pipefail

# Réglage global (bloc http) : s'applique à tous les sites servis par ce Nginx.
cat > /etc/nginx/conf.d/crmaster-uploads.conf <<'NGINX'
client_max_body_size 2G;
proxy_read_timeout 600s;
proxy_send_timeout 600s;
NGINX

# Une valeur posée dans le bloc server du site prendrait le dessus : on la retire.
for f in /etc/nginx/sites-available/crmaster /etc/nginx/nginx.conf; do
  if [[ -f "$f" ]]; then
    sed -i '/^\s*\(client_max_body_size\|proxy_read_timeout\|proxy_send_timeout\)\s/d' "$f"
  fi
done

nginx -t
systemctl reload nginx

echo "    Limite active :"
nginx -T 2>/dev/null | grep -n "client_max_body_size" | sed 's/^/      /' || true
