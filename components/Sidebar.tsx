"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, LogOut, Plus, Settings, Video } from "lucide-react";

const links = [
  { href: "/", label: "Réunions", icon: CalendarClock },
  { href: "/reunions/nouvelle", label: "Nouvelle réunion", icon: Plus },
  { href: "/parametres", label: "Paramètres", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white/80 px-4 py-8 backdrop-blur md:flex">
      <div className="mb-10 flex items-center gap-2.5 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 text-white shadow-sm">
          <Video size={18} />
        </div>
        <span className="text-lg font-bold tracking-tight text-slate-900">CRMASTER</span>
      </div>
      <nav className="space-y-1">
        {links.map((link) => {
          const active =
            link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
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
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
        >
          <LogOut size={17} strokeWidth={2.25} />
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
