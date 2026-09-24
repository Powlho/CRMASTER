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

echo "==> Terminé."
