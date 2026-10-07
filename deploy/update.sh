#!/usr/bin/env bash
#
# Redéploie CRMASTER après un nouveau push sur la branche suivie.
# À lancer depuis le VPS : cd /opt/crmaster && bash deploy/update.sh

set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Récupération des derniers changements"
git pull

echo "==> Outils audio (ffmpeg, yt-dlp)"
if ! command -v ffmpeg >/dev/null; then
  apt-get install -y ffmpeg
fi
if ! command -v yt-dlp >/dev/null; then
  curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp
  chmod a+rx /usr/local/bin/yt-dlp
else
  # Les sites changent souvent : garder yt-dlp à jour évite la plupart des échecs.
  yt-dlp -U || true
fi

NGINX_CONF=/etc/nginx/sites-available/crmaster
if [[ -f "$NGINX_CONF" ]] && ! grep -q client_max_body_size "$NGINX_CONF"; then
  echo "==> Nginx : autorisation des envois de fichiers audio volumineux"
  sed -i '0,/server_name .*;/s//&\n    client_max_body_size 500M;\n    proxy_read_timeout 300s;\n    proxy_send_timeout 300s;/' "$NGINX_CONF"
  nginx -t && systemctl reload nginx
fi

echo "==> Installation des dépendances et build"
npm install
npm run build

echo "==> Redémarrage"
pm2 restart crmaster

echo "==> Terminé."
