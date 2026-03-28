"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { buttonStyles, ui } from "@/lib/ui";

export function ConversationActions({
  conversationId,
  workspaceId,
  title,
  status,
  isActive,
}: {
  conversationId: string;
  workspaceId: string;
  title: string;
  status: "active" | "archived";
  isActive: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function updateConversation(patch: Record<string, unknown>, nextHref?: string) {
    setError(null);

    const response = await fetch(`/api/conversations/${conversationId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(patch),
    });

    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;

    if (!response.ok) {
      setError(body?.error ?? "更新会话失败");
      return;
    }

    startTransition(() => {
      if (nextHref) {
        router.push(nextHref);
      }
      router.refresh();
    });
  }

  async function handleRename() {
    const nextTitle = window.prompt("输入新的会话名称", title);
    if (nextTitle === null) {
      return;
    }

    await updateConversation({ title: nextTitle });
  }

  async function handleArchiveToggle() {
    const nextStatus = status === "active" ? "archived" : "active";
    const nextHref =
      status === "active" && isActive ? `/workspaces/${workspaceId}` : undefined;

    await updateConversation({ status: nextStatus }, nextHref);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        className={buttonStyles({ variant: "secondary", size: "sm" })}
        disabled={isPending}
        onClick={handleRename}
        type="button"
      >
        重命名
      </button>
      <button
        className={buttonStyles({ variant: "secondary", size: "sm" })}
        disabled={isPending}
        onClick={handleArchiveToggle}
        type="button"
      >
        {status === "active" ? "归档" : "恢复"}
      </button>
      {error ? <span className={ui.error}>{error}</span> : null}
    </div>
  );
}
