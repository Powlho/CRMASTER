"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, LogOut, Plus, Settings, Shield, Video } from "lucide-react";
import { useCurrentUser } from "@/lib/useCurrentUser";

const links = [
  { href: "/", label: "Réunions", icon: CalendarClock },
  { href: "/reunions/nouvelle", label: "Nouvelle réunion", icon: Plus },
  { href: "/parametres", label: "Paramètres", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const currentUser = useCurrentUser();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const allLinks =
    currentUser?.role === "admin"
      ? [...links, { href: "/admin", label: "Administration", icon: Shield }]
      : links;

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-4 pb-2 pt-3 backdrop-blur md:hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-violet-500 text-white">
            <Video size={16} />
          </div>
          <span className="font-bold tracking-tight text-slate-900">CRMASTER</span>
        </div>
        <button
          onClick={handleLogout}
          aria-label="Déconnexion"
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
        >
          <LogOut size={18} />
        </button>
      </div>
      <nav className="-mx-1 mt-2 flex gap-1 overflow-x-auto">
        {allLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
                isActive(link.href) ? "bg-brand-50 text-brand-700" : "text-slate-600"
              }`}
            >
              <Icon size={15} />
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white/80 px-4 py-8 backdrop-blur md:flex">
      <div className="mb-10 flex items-center gap-2.5 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 text-white shadow-sm">
          <Video size={18} />
        </div>
        <span className="text-lg font-bold tracking-tight text-slate-900">CRMASTER</span>
      </div>
      <nav className="space-y-1">
        {allLinks.map((link) => {
          const active = isActive(link.href);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-brand-500 to-violet-500" />
              )}
              <Icon size={17} strokeWidth={2.25} />
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto pt-6">
        {currentUser && (
          <p className="mb-2 truncate px-3 text-xs text-slate-400">
            Connecté : {currentUser.username}
          </p>
        )}
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
        >
          <LogOut size={17} strokeWidth={2.25} />
          Déconnexion
        </button>
      </div>
    </aside>
    </>
  );
}
