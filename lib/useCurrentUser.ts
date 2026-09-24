"use client";

import { useEffect, useState } from "react";

export interface CurrentUser {
  id: string;
  username: string;
  role: "admin" | "user";
  notionEnabled: boolean;
  createdAt: string;
}

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: CurrentUser | null) => {
        if (!cancelled) setUser(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return user;
}
