"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { buttonStyles, ui } from "@/lib/ui";

export function ConversationRetryButton({
  conversationId,
}: {
  conversationId: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleRetry() {
    setStatus(null);

    const response = await fetch(`/api/conversations/${conversationId}/retry`, {
      method: "POST",
    });
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;

    if (!response.ok) {
      setStatus(body?.error ?? "重新生成失败。");
      return;
    }

    setStatus("正在重新生成回答...");
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="grid gap-2 pt-1">
      <div>
        <button
          className={buttonStyles({ variant: "secondary", size: "sm" })}
          disabled={isPending}
          onClick={handleRetry}
          type="button"
        >
          重新生成
        </button>
      </div>
      {status ? <span className={ui.muted}>{status}</span> : null}
    </div>
  );
}
