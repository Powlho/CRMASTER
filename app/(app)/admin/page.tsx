"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Database, Download, HardDrive, Plus, Shield, Trash2 } from "lucide-react";
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
        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
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

      <StorageSection />
    </div>
  );
}

const RETENTION_LABELS: Record<number, string> = {
  0: "Indéfiniment",
  30: "30 jours",
  60: "60 jours",
  90: "3 mois",
  180: "6 mois",
  365: "1 an",
};

interface StorageInfo {
  settings: { audioRetentionDays: number };
  usage: { files: number; bytes: number; diskFreeBytes: number | null };
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1).replace(".", ",")} Go`;
  return `${Math.round(bytes / 1024 ** 2)} Mo`;
}

function StorageSection() {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.settings) setInfo(data);
      })
      .catch(() => setError("Impossible de lire les réglages."));
  }, []);

  async function changeRetention(days: number) {
    if (
      days > 0 &&
      !window.confirm(
        `Les fichiers audio de plus de ${RETENTION_LABELS[days]} seront supprimés définitivement, dès maintenant puis automatiquement. Les transcriptions et comptes rendus sont conservés. Continuer ?`
      )
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ audioRetentionDays: days }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Échec de l'enregistrement.");
        return;
      }
      setInfo({ settings: data.settings, usage: data.usage });
      setMessage(
        data.report.deletedAudio > 0
          ? `Réglage enregistré : ${data.report.deletedAudio} fichier(s) audio supprimé(s).`
          : "Réglage enregistré."
      );
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-1 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-violet-500 text-white">
          <HardDrive size={15} />
        </div>
        <h2 className="text-base font-semibold text-slate-900">Stockage et sauvegarde</h2>
      </div>

      {info && (
        <p className="mb-5 text-sm text-slate-500">
          {info.usage.files} enregistrement(s) audio · {formatBytes(info.usage.bytes)}
          {info.usage.diskFreeBytes !== null &&
            ` · ${formatBytes(info.usage.diskFreeBytes)} libres sur le serveur`}
        </p>
      )}

      <div className="mb-6">
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Conservation des fichiers audio
        </label>
        <p className="mb-2 text-xs text-slate-500">
          Passé ce délai, l&apos;audio est supprimé automatiquement (la transcription et le
          compte rendu restent). Moins on garde d&apos;enregistrements de voix, mieux c&apos;est
          pour la vie privée des participants (RGPD) — et pour l&apos;espace disque.
        </p>
        <select
          value={info?.settings.audioRetentionDays ?? 0}
          disabled={!info || saving}
          onChange={(e) => changeRetention(Number(e.target.value))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {Object.entries(RETENTION_LABELS).map(([days, label]) => (
            <option key={days} value={days}>
              {label}
            </option>
          ))}
        </select>
        {message && <p className="mt-2 text-xs text-emerald-600">{message}</p>}
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>

      <div>
        <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
          <Database size={14} />
          Sauvegarde
        </p>
        <p className="mb-2 text-xs text-slate-500">
          Le serveur garde chaque nuit une copie des réunions (30 derniers jours). Pour une
          copie hors du serveur, téléchargez de temps en temps toutes les réunions,
          transcriptions et comptes rendus (sans les fichiers audio).
        </p>
        <a
          href="/api/admin/backup"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Download size={14} />
          Télécharger une sauvegarde
        </a>
      </div>
    </section>
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

