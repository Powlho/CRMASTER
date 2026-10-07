# CRMASTER

## Configuration

Copiez `.env.example` en `.env.local` et renseignez :

- `ASSEMBLYAI_API_KEY` — clé API [AssemblyAI](https://www.assemblyai.com/) (transcription)
- `NOTION_API_KEY` et `NOTION_DATABASE_ID` — intégration [Notion](https://www.notion.so/my-integrations) (envoi des comptes-rendus)
- `AUTH_SECRET` — signe les sessions (obligatoire dès que le site est exposé publiquement) ;
  se génère avec `openssl rand -hex 32`
- `APP_PASSWORD` — mot de passe du tout premier compte (identifiant `admin`), créé
  automatiquement au premier démarrage. Les comptes suivants (multi-utilisateurs, avec ou
  sans envoi Notion) se créent ensuite depuis la page **Administration**.

Détails pas à pas dans la page **Paramètres** de l'application. Les réunions sont stockées
côté serveur dans `DATA_DIR` (par défaut `./data`, en JSON, un fichier par compte n'est pas
nécessaire : chaque réunion est rattachée à son propriétaire) — ce dossier n'est jamais commit.
Les fichiers audio sont dans `DATA_DIR/audio` ; leur durée de conservation se règle dans
**Administration** (suppression automatique, transcriptions conservées).

### Enregistrement fiable

Pendant l'enregistrement, l'audio est envoyé au serveur toutes les 5 secondes et copié sur
l'appareil (IndexedDB). Réseau coupé, onglet fermé ou téléphone éteint : l'enregistrement
interrompu se récupère en rouvrant la réunion (depuis l'appareil, ou depuis ce que le serveur
a déjà reçu).

### Application installable (Android) et partage

En HTTPS, CRMASTER s'installe depuis Chrome (menu ⋮ → Installer l'application, ou bouton
dans **Paramètres**). Elle apparaît alors dans le menu **Partager** d'Android : depuis
l'Enregistreur Google, Partager → Fichier audio → CRMASTER ouvre `/partager`, qui crée la
réunion, envoie l'audio et lance la transcription. Le fichier est reçu par le service worker
(`public/sw.js`) et gardé sur l'appareil jusqu'à l'envoi.

### Sauvegarde

`deploy/install-backup.sh` (lancé automatiquement par `setup-vps.sh` et `update.sh` en root)
programme une sauvegarde nocturne des données JSON dans `/var/backups/crmaster` (30 jours).
Une copie hors serveur se télécharge depuis la page **Administration**.

### Mettre à jour une instance déjà déployée

Ajoutez simplement `APP_PASSWORD` et `AUTH_SECRET` à votre `.env.local` existant, puis
redémarrez (`pm2 restart crmaster` après `bash deploy/update.sh`). Sans ces deux variables,
l'application affiche une page « Authentification non configurée » au lieu de démarrer —
c'est voulu, pour ne jamais laisser le site ouvert par erreur. Au premier login, le compte
`admin` est créé avec `APP_PASSWORD`, et les réunions existantes (créées avant les comptes
multi-utilisateurs) lui sont automatiquement rattachées.

## Transcription

La transcription se lance **manuellement** depuis la page d'une réunion (bouton « Lancer la
transcription »), une fois l'audio en place : enregistrement, fichier importé, ou fichier de la
**Bibliothèque audio**. Le résumé, le compte rendu et l'envoi vers Notion suivent comme avant.

Les imports partent par morceaux de 16 Mo : ils passent derrière Cloudflare (100 Mo maximum par
requête) jusqu'à 2 Go.

## Agenda Google

La page **Agenda** affiche les événements Google Agenda de chaque compte (lecture seule) ; un clic
sur un événement ouvre « Nouvelle réunion » prérempli (titre, date, heure, participants, lien
visio, description). Chaque compte connecte son propre agenda ; le jeton est stocké chiffré
(`data/google-tokens.json`, clé dérivée d'`AUTH_SECRET`).

Configuration (une fois) : projet Google Cloud avec l'API Google Calendar activée, écran de
consentement **publié** (en mode « Test » l'accès expire au bout de 7 jours), ID client OAuth
« Application Web » avec l'URI de redirection `<APP_URL>/api/google/callback`, puis
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` et `APP_URL` dans `.env.local`. La page Agenda détaille
ces étapes et affiche l'URI exacte à déclarer.

## Bibliothèque audio (YouTube et autres plateformes)

La page **Bibliothèque audio** récupère la piste audio d'une vidéo à partir de son lien (YouTube,
Vimeo, Dailymotion, Twitch, X, LinkedIn… — tous les sites gérés par
[yt-dlp](https://github.com/yt-dlp/yt-dlp)). Les fichiers sont propres à chaque compte, stockés
dans `data/library/`, et utilisables comme audio d'une réunion (« Compte rendu » depuis la
bibliothèque, ou « Audio de la bibliothèque » sur la page d'une réunion).

Prérequis serveur : `yt-dlp` et `ffmpeg` (installés et tenus à jour par `deploy/setup-vps.sh` et
`deploy/update.sh`).

Si YouTube refuse le téléchargement depuis le VPS (« Sign in to confirm you're not a bot »), un
administrateur peut envoyer un fichier de cookies YouTube depuis la section **Cookies YouTube**
de la bibliothèque (stocké dans `data/youtube-cookies.txt`).

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
   cd /opt/crmaster && sudo bash deploy/update.sh
   ```

Le script ne touche jamais à la configuration SSH (pas de désactivation de l'auth par mot de
passe, pas de création d'utilisateur) — à durcir vous-même si besoin, une fois à l'aise avec le
serveur.