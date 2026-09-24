# CRMASTER

## Configuration

Copiez `.env.example` en `.env.local` et renseignez :

- `ASSEMBLYAI_API_KEY` — clé API [AssemblyAI](https://www.assemblyai.com/) (transcription)
- `NOTION_API_KEY` et `NOTION_DATABASE_ID` — intégration [Notion](https://www.notion.so/my-integrations) (envoi des comptes-rendus)

Détails pas à pas dans la page **Paramètres** de l'application.

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