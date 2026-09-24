#!/usr/bin/env bash
#
# Configure un VPS Ubuntu 24.04 LTS "propre" pour héberger CRMASTER.
# À exécuter UNE FOIS, en root, juste après la première connexion SSH :
#
#   ssh root@VOTRE_IP_VPS
#   curl -fsSL https://raw.githubusercontent.com/Powlho/CRMASTER/main/deploy/setup-vps.sh -o setup-vps.sh
#   bash setup-vps.sh
#
# (Tant que la PR n'est pas fusionnée sur main, remplacez "main" par le nom de la branche,
# ou copiez-collez simplement le contenu de ce fichier dans le terminal SSH.)
#
# Le script installe Node.js, Nginx, PM2, un pare-feu de base, clone le dépôt,
# construit l'app et la démarre — avec HTTPS automatique si un nom de domaine
# pointe déjà vers ce VPS.

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Ce script doit être lancé en root (ou avec sudo)." >&2
  exit 1
fi

REPO_URL_DEFAULT="https://github.com/Powlho/CRMASTER.git"
APP_DIR="/opt/crmaster"

read -rp "URL du dépôt Git [${REPO_URL_DEFAULT}] : " REPO_URL
REPO_URL="${REPO_URL:-$REPO_URL_DEFAULT}"

read -rp "Branche à déployer [main] : " REPO_BRANCH
REPO_BRANCH="${REPO_BRANCH:-main}"

read -rp "Nom de domaine pointant déjà vers ce VPS (laisser vide si aucun pour l'instant) : " DOMAIN
if [[ -n "$DOMAIN" ]]; then
  read -rp "Email pour le certificat HTTPS (Let's Encrypt) : " CERT_EMAIL
fi

echo "==> Mise à jour du système"
apt-get update -y
apt-get upgrade -y

echo "==> Installation des paquets de base"
apt-get install -y curl git ufw fail2ban nginx

echo "==> Installation de Node.js 20 LTS"
if ! command -v node >/dev/null || [[ "$(node -v)" != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "==> Installation de PM2 (gestionnaire de process)"
npm install -g pm2

echo "==> Pare-feu (SSH, HTTP, HTTPS uniquement)"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Fail2ban (protection brute-force SSH)"
systemctl enable --now fail2ban

echo "==> Récupération du code"
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" fetch origin
  git -C "$APP_DIR" checkout "$REPO_BRANCH"
  git -C "$APP_DIR" pull origin "$REPO_BRANCH"
else
  git clone --branch "$REPO_BRANCH" "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

if [[ ! -f .env.local ]]; then
  cp .env.example .env.local
  if command -v openssl >/dev/null 2>&1; then
    GENERATED_SECRET=$(openssl rand -hex 32)
    sed -i "s#^AUTH_SECRET=.*#AUTH_SECRET=${GENERATED_SECRET}#" .env.local
  fi
  echo "!! Fichier .env.local créé. Éditez-le avant de continuer :"
  echo "   nano $APP_DIR/.env.local"
  echo "   (ASSEMBLYAI_API_KEY, NOTION_API_KEY, NOTION_DATABASE_ID, APP_PASSWORD"
  echo "    — AUTH_SECRET a déjà été généré automatiquement)"
  read -rp "Appuyez sur Entrée une fois les clés renseignées pour continuer..." _
fi

echo "==> Installation des dépendances et build"
npm install
npm run build

echo "==> Démarrage avec PM2"
pm2 delete crmaster >/dev/null 2>&1 || true
pm2 start npm --name crmaster -- start
pm2 save
pm2 startup systemd -u root --hp /root | tail -n 1 | bash || true

echo "==> Configuration Nginx (reverse proxy vers le port 3000)"
cat > /etc/nginx/sites-available/crmaster <<NGINX
server {
    listen 80;
    server_name ${DOMAIN:-_};

    # Enregistrements audio : Nginx refuse par défaut tout envoi > 1 Mo (~1 min d'audio).
    client_max_body_size 500M;

    location / {
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/crmaster /etc/nginx/sites-enabled/crmaster
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

if [[ -n "$DOMAIN" ]]; then
  echo "==> Certificat HTTPS (Let's Encrypt) pour $DOMAIN"
  apt-get install -y certbot python3-certbot-nginx
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$CERT_EMAIL" --redirect
  echo "==> Terminé. Application disponible sur https://$DOMAIN"
else
  echo "==> Terminé. Application disponible sur http://$(curl -s ifconfig.me)"
  echo "    Ajoutez un nom de domaine pointant vers cette IP puis relancez :"
  echo "    certbot --nginx -d votredomaine.fr"
fi

echo ""
echo "Pour mettre à jour l'app après un nouveau push : bash deploy/update.sh"
