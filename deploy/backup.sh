#!/usr/bin/env bash
#
# Sauvegarde des données de CRMASTER (réunions, transcriptions, comptes, réglages).
# Lancée chaque nuit par cron (voir deploy/install-backup.sh). Les fichiers audio ne sont
# pas copiés : ils sont volumineux et une copie sur le même disque ne protège de rien.
#
# Restauration : arrêter l'app (pm2 stop crmaster), extraire l'archive dans le dossier
# data, puis pm2 start crmaster.

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/crmaster}"
KEEP_DAYS="${KEEP_DAYS:-30}"

# Même dossier de données que l'app (DATA_DIR dans .env.local, sinon ./data).
DATA_DIR="$APP_DIR/data"
if [[ -f "$APP_DIR/.env.local" ]]; then
  CONFIGURED="$(grep -E '^DATA_DIR=' "$APP_DIR/.env.local" | tail -n 1 | cut -d= -f2- | tr -d '"' || true)"
  [[ -n "$CONFIGURED" ]] && DATA_DIR="$CONFIGURED"
fi

FILES=()
for f in meetings.json users.json settings.json; do
  [[ -f "$DATA_DIR/$f" ]] && FILES+=("$f")
done
if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "$(date -Is) rien à sauvegarder dans $DATA_DIR"
  exit 0
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
ARCHIVE="$BACKUP_DIR/crmaster-$(date +%Y%m%d-%H%M).tar.gz"
tar -czf "$ARCHIVE" -C "$DATA_DIR" "${FILES[@]}"
chmod 600 "$ARCHIVE"

find "$BACKUP_DIR" -name 'crmaster-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) sauvegarde créée : $ARCHIVE"
