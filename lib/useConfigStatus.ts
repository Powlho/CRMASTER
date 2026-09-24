"use client";

import { useEffect, useState } from "react";

export interface ConfigStatus {
  assemblyAI: boolean;
  notion: boolean;
}

export function useConfigStatus() {
  const [status, setStatus] = useState<ConfigStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config/status")
      .then((r) => r.json())
      .then((data: ConfigStatus) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) setStatus({ assemblyAI: false, notion: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
