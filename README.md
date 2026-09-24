# CRMASTER

## Configuration

Copiez `.env.example` en `.env.local` et renseignez :

- `ASSEMBLYAI_API_KEY` — clé API [AssemblyAI](https://www.assemblyai.com/) (transcription)
- `NOTION_API_KEY` et `NOTION_DATABASE_ID` — intégration [Notion](https://www.notion.so/my-integrations) (envoi des comptes-rendus)
- `APP_PASSWORD` et `AUTH_SECRET` — protègent l'accès à l'application (obligatoires dès que le
  site est exposé publiquement ; `AUTH_SECRET` se génère avec `openssl rand -hex 32`)

Détails pas à pas dans la page **Paramètres** de l'application. Les réunions sont stockées
côté serveur dans `DATA_DIR` (par défaut `./data`, en JSON) — ce dossier n'est jamais commit.

### Mettre à jour une instance déjà déployée

Ajoutez simplement `APP_PASSWORD` et `AUTH_SECRET` à votre `.env.local` existant, puis
redémarrez (`pm2 restart crmaster` après `bash deploy/update.sh`). Sans ces deux variables,
l'application affiche une page « Authentification non configurée » au lieu de démarrer —
c'est voulu, pour ne jamais laisser le site ouvert par erreur.

## Développement

```bash
npm install
npm run dev
```

## Déploiement (sans VPS)

Ce dépôt inclut un `render.yaml` pour un déploiement gratuit sur [Render](https://render.com/) :

1. Sur [render.com](https://dashboard.render.com/), **New +** → **Blueprint**, connectez ce dépôt GitHub.
2. Render détecte `render.yaml` et propose le service `crmaster` (plan gratuit).
3. Renseignez `ASSEMBLYAI_API_KEY`, `NOTION_API_KEY`, `NOTION_DATABASE_ID` quand demandé (ou plus tard dans Environment).
4. Déployez. L'app est accessible sur l'URL `*.onrender.com` fournie.

Note : le plan gratuit met le service en veille après 15 min d'inactivité (relance en ~1 min à la
requête suivante). Suffisant pour tester ; à passer sur un plan payant ou un VPS pour un usage
régulier sans délai de réveil.

## Déploiement sur un VPS (OVH, Ubuntu 24.04 LTS)

1. Commandez un VPS OVH avec l'image **Ubuntu 24.04 LTS**.
2. Connectez-vous en SSH (`ssh root@VOTRE_IP`).
3. Copiez le contenu de [`deploy/setup-vps.sh`](deploy/setup-vps.sh) dans le terminal (ou
   récupérez-le via `curl` une fois la branche fusionnée sur `main`) et exécutez-le :
   ```bash
   bash setup-vps.sh
   ```
   Le script installe Node.js, Nginx, PM2, un pare-feu (UFW) et fail2ban, clone le dépôt,
   vous invite à renseigner `.env.local`, build l'app, la démarre en tâche de fond avec
   redémarrage automatique, et configure Nginx en reverse proxy — avec HTTPS automatique
   (Let's Encrypt) si vous avez déjà un nom de domaine pointant vers le VPS.
4. Pour les mises à jour suivantes (après un nouveau push) :
   ```bash
   cd /opt/crmaster && bash deploy/update.sh
   ```

Le script ne touche jamais à la configuration SSH (pas de désactivation de l'auth par mot de
passe, pas de création d'utilisateur) — à durcir vous-même si besoin, une fois à l'aise avec le
serveur.