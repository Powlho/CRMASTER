#!/usr/bin/env bash
#
# Programme la sauvegarde nocturne (3 h 17) de CRMASTER. À lancer une fois en root :
#   cd /opt/crmaster && sudo bash deploy/install-backup.sh
# Sans effet si c'est déjà fait.

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Ce script doit être lancé en root (ou avec sudo)." >&2
  exit 1
fi

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
chmod +x "$APP_DIR/deploy/backup.sh"

cat > /etc/cron.d/crmaster-backup <<CRON
# Sauvegarde nocturne des données CRMASTER (voir deploy/backup.sh)
17 3 * * * root $APP_DIR/deploy/backup.sh >> /var/log/crmaster-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/crmaster-backup

# Première sauvegarde tout de suite, pour vérifier que tout fonctionne.
"$APP_DIR/deploy/backup.sh"
echo "==> Sauvegarde nocturne programmée (archives dans /var/backups/crmaster)."
