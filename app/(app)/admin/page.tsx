"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Shield, Trash2 } from "lucide-react";
import { useCurrentUser } from "@/lib/useCurrentUser";

interface AdminUser {
  id: string;
  username: string;
  role: "admin" | "user";
  notionEnabled: boolean;
  createdAt: string;
}

export default function AdminPage() {
  const currentUser = useCurrentUser();
  const router = useRouter();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser && currentUser.role !== "admin") {
      router.replace("/");
    }
  }, [currentUser, router]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== "admin") return;
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setUsers(data);
        else setListError(data.error || "Échec du chargement.");
      })
      .catch(() => setListError("Impossible de contacter le serveur."))
      .finally(() => setLoading(false));
  }, [currentUser]);

  function refresh() {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setUsers(data);
      });
  }

  if (!currentUser || currentUser.role !== "admin") {
    return <p className="text-sm text-slate-400">Chargement…</p>;
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-1 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 text-white">
          <Shield size={18} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Administration</h1>
      </div>
      <p className="mb-8 text-sm text-slate-500">
        Gérez les comptes qui peuvent accéder à l&apos;application. Chacun a sa propre liste
        de réunions ; l&apos;envoi vers Notion s&apos;active individuellement par compte.
      </p>

      {listError && <p className="mb-4 text-sm text-red-600">{listError}</p>}

      <NewUserForm currentUserId={currentUser.id} onCreated={refresh} />

      {!loading && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Utilisateur</th>
                <th className="px-4 py-3 font-medium">Rôle</th>
                <th className="px-4 py-3 font-medium">Notion</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  isSelf={u.id === currentUser.id}
                  onChanged={refresh}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NewUserForm({
  currentUserId,
  onCreated,
}: {
  currentUserId: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [notionEnabled, setNotionEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password, role, notionEnabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Échec de la création.");
        return;
      }
      setUsername("");
      setPassword("");
      setRole("user");
      setNotionEnabled(false);
      setOpen(false);
      onCreated();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-500 to-violet-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90"
      >
        <Plus size={16} />
        Ajouter un compte
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Nom d&apos;utilisateur
          </label>
          <input
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Mot de passe</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </div>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={role === "admin"}
            onChange={(e) => setRole(e.target.checked ? "admin" : "user")}
          />
          Administrateur
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={notionEnabled}
            onChange={(e) => setNotionEnabled(e.target.checked)}
          />
          Envoi vers Notion activé
        </label>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-gradient-to-r from-brand-500 to-violet-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? "Création…" : "Créer le compte"}
        </button>
      </div>
    </form>
  );
}

function UserRow({
  user,
  isSelf,
  onChanged,
}: {
  user: AdminUser;
  isSelf: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  async function toggleNotion() {
    setBusy(true);
    setRowError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notionEnabled: !user.notionEnabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRowError(data.error || "Échec.");
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Supprimer le compte « ${user.username} » ?`)) return;
    setBusy(true);
    setRowError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setRowError(data.error || "Échec de la suppression.");
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-b border-slate-50 last:border-0">
      <td className="px-4 py-3 font-medium text-slate-800">
        {user.username}
        {isSelf && <span className="ml-2 text-xs font-normal text-slate-400">(vous)</span>}
      </td>
      <td className="px-4 py-3 text-slate-600">
        {user.role === "admin" ? "Administrateur" : "Utilisateur"}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={toggleNotion}
          disabled={busy}
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            user.notionEnabled
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          {user.notionEnabled ? "Activé" : "Désactivé"}
        </button>
      </td>
      <td className="px-4 py-3 text-right">
        {!isSelf && (
          <button
            onClick={handleDelete}
            disabled={busy}
            className="text-slate-400 hover:text-red-600"
            title="Supprimer"
          >
            <Trash2 size={15} />
          </button>
        )}
        {rowError && <p className="mt-1 text-xs text-red-600">{rowError}</p>}
      </td>
    </tr>
  );
}

