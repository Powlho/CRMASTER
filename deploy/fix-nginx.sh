#!/usr/bin/env bash
#
# Conservé pour les installations existantes qui l'appellent encore : les réglages Nginx de
# CRMASTER (taille d'envoi, délais) sont désormais posés par deploy/nginx-uploads.sh.
#   cd /opt/crmaster && sudo bash deploy/fix-nginx.sh

set -euo pipefail
exec bash "$(dirname "$0")/nginx-uploads.sh"
