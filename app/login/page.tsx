"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";

function LoginForm() {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Mot de passe incorrect.");
        setLoading(false);
        return;
      }
      const next = searchParams.get("next");
      window.location.href = next && next.startsWith("/") ? next : "/";
    } catch {
      setError("Impossible de contacter le serveur.");
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
    >
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 text-white">
          <Lock size={20} />
        </div>
        <h1 className="text-lg font-bold text-slate-900">CRMASTER</h1>
        <p className="mt-1 text-sm text-slate-500">Accès protégé</p>
      </div>
      <label className="mb-1 block text-sm font-medium text-slate-700">Mot de passe</label>
      <input
        type="password"
        autoFocus
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-gradient-to-r from-brand-500 to-violet-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-60"
      >
        {loading ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
