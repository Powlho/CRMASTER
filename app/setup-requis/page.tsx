export default function SetupRequisPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
        <h1 className="mb-2 text-lg font-bold text-slate-900">Authentification non configurée</h1>
        <p className="mb-4 text-sm text-slate-600">
          Ajoutez <code className="rounded bg-white px-1">AUTH_SECRET</code> (obligatoire) dans{" "}
          <code className="rounded bg-white px-1">.env.local</code>, puis redémarrez le serveur.
          Pour pouvoir vous connecter la première fois, ajoutez aussi{" "}
          <code className="rounded bg-white px-1">APP_PASSWORD</code> : un compte administrateur
          (identifiant <code className="rounded bg-white px-1">admin</code>) sera créé
          automatiquement avec ce mot de passe.
        </p>
        <pre className="whitespace-pre-wrap rounded-lg bg-slate-900 p-3 text-left text-xs text-slate-100">
{`AUTH_SECRET=<sortie de: openssl rand -hex 32>
APP_PASSWORD=mot_de_passe_du_premier_compte_admin`}
        </pre>
      </div>
    </div>
  );
}
