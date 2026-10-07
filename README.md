# CRMASTER

## Configuration

Copiez `.env.example` en `.env.local` et renseignez :

- `ASSEMBLYAI_API_KEY` — clé API [AssemblyAI](https://www.assemblyai.com/) (transcription)
- `NOTION_API_KEY` et `NOTION_DATABASE_ID` — intégration [Notion](https://www.notion.so/my-integrations) (envoi des comptes-rendus)

Détails pas à pas dans la page **Paramètres** de l'application.

## Transcription

La transcription se lance **manuellement** depuis la page d'une réunion (bouton « Lancer la
transcription »), à partir d'un fichier audio au choix :

- l'enregistrement fait dans le navigateur (sauvegardé automatiquement sur le serveur à l'arrêt) ;
- un fichier de la **Bibliothèque audio** ;
- un fichier importé depuis votre ordinateur.

Le compte rendu est ensuite envoyé vers Notion.

## Bibliothèque audio (YouTube et autres plateformes)

La page **Bibliothèque audio** (barre latérale) récupère la piste audio d'une vidéo à partir de son
lien (YouTube, Vimeo, Dailymotion, Twitch, X, LinkedIn… — tous les sites gérés par
[yt-dlp](https://github.com/yt-dlp/yt-dlp)). Les fichiers sont stockés sur le serveur
(`data/audio/` par défaut, ou `AUDIO_STORAGE_DIR`), écoutables et téléchargeables depuis l'app, et
le bouton « Compte rendu » crée une réunion prête à être transcrite.

Prérequis serveur : `yt-dlp` et `ffmpeg` (installés automatiquement par `deploy/setup-vps.sh` et
`deploy/update.sh`). En local : `pip install yt-dlp` (ou `brew install yt-dlp ffmpeg`).

Si YouTube refuse le téléchargement depuis le VPS (« Sign in to confirm you're not a bot »),
exportez les cookies de votre navigateur au format Netscape (extension « Get cookies.txt
LOCALLY ») vers un fichier sur le serveur et renseignez `YTDLP_COOKIES_FILE`.

Cette fonctionnalité nécessite un VPS : sur le plan gratuit de Render, yt-dlp n'est pas installé et
le disque n'est pas persistant.

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