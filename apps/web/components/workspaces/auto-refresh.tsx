"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { DEFAULT_AUTO_REFRESH_INTERVAL_MS } from "@anchordesk/contracts";

export function WorkspaceAutoRefresh({
  enabled,
  intervalMs = DEFAULT_AUTO_REFRESH_INTERVAL_MS,
}: {
  enabled: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const timer = window.setInterval(() => {
      startTransition(() => {
        router.refresh();
      });
    }, intervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [enabled, intervalMs, router, startTransition]);

  return null;
}
