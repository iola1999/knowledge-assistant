"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { buttonStyles, ui } from "@/lib/ui";

export function RetryDocumentJobButton({
  jobId,
  forceReparse = false,
  label,
}: {
  jobId: string;
  forceReparse?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleRetry() {
    setError(null);

    const response = await fetch(`/api/document-jobs/${jobId}/retry`, {
      method: "POST",
      headers: forceReparse
        ? {
            "content-type": "application/json",
          }
        : undefined,
      body: forceReparse
        ? JSON.stringify({
            forceReparse: true,
          })
        : undefined,
    });
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;

    if (!response.ok) {
      setError(body?.error ?? (forceReparse ? "强制重新解析失败" : "重试任务失败"));
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="grid gap-2">
      <button
        className={buttonStyles({ variant: "secondary" })}
        disabled={isPending}
        onClick={handleRetry}
        type="button"
      >
        {isPending ? "提交中..." : (label ?? (forceReparse ? "强制重新解析" : "重试任务"))}
      </button>
      {error ? <p className={ui.error}>{error}</p> : null}
    </div>
  );
}
