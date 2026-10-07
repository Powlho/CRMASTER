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

echo "==> Installation des dépendances et build"
npm install
npm run build

echo "==> Redémarrage"
pm2 restart crmaster

# Réglages Nginx (taille d'envoi, délais).
if command -v nginx >/dev/null; then
  bash deploy/nginx-uploads.sh || true
fi

# Sauvegarde nocturne (programmée une fois).
if [[ ! -f /etc/cron.d/crmaster-backup ]]; then
  echo "==> Programmation de la sauvegarde nocturne"
  bash deploy/install-backup.sh
fi

echo "==> Terminé."
