#!/usr/bin/env bash
#
# Redéploie CRMASTER après un nouveau push sur la branche suivie.
# À lancer depuis le VPS : cd /opt/crmaster && bash deploy/update.sh

set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Récupération des derniers changements"
git pull

echo "==> Installation des dépendances et build"
npm install
npm run build

echo "==> Redémarrage"
pm2 restart crmaster

# Réglages Nginx (taille d'envoi, délai) des installations antérieures, si root.
if [[ $EUID -eq 0 ]]; then
  bash deploy/fix-nginx.sh || true
fi

# Sauvegarde nocturne (programmée une fois, si le script tourne en root).
if [[ $EUID -eq 0 && ! -f /etc/cron.d/crmaster-backup ]]; then
  echo "==> Programmation de la sauvegarde nocturne"
  bash deploy/install-backup.sh
fi

echo "==> Terminé."
