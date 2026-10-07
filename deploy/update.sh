#!/usr/bin/env bash
#
# Redéploie CRMASTER après un nouveau push sur la branche suivie.
# À lancer depuis le VPS : cd /opt/crmaster && bash deploy/update.sh

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Ce script doit être lancé en root : sudo bash deploy/update.sh" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

# Évite l'erreur git « detected dubious ownership » quand le dossier appartient à un autre
# utilisateur que celui qui lance le script.
git config --global --get-all safe.directory | grep -qx "$PWD" ||
  git config --global --add safe.directory "$PWD"

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
if [[ -f "$NGINX_CONF" ]] && ! grep -q "client_max_body_size 2G;" "$NGINX_CONF"; then
  echo "==> Nginx : autorisation des envois de fichiers audio/vidéo volumineux (2 Go)"
  sed -i '/client_max_body_size\|proxy_read_timeout\|proxy_send_timeout/d' "$NGINX_CONF"
  sed -i '0,/server_name .*;/s//&\n    client_max_body_size 2G;\n    proxy_read_timeout 600s;\n    proxy_send_timeout 600s;/' "$NGINX_CONF"
  nginx -t && systemctl reload nginx
fi

echo "==> Installation des dépendances et build"
npm install
npm run build

echo "==> Redémarrage"
pm2 restart crmaster

echo "==> Terminé."
