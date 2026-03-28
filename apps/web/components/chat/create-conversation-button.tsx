"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { buttonStyles, ui } from "@/lib/ui";

export function CreateConversationButton({
  workspaceId,
  label = "新建对话",
}: {
  workspaceId: string;
  label?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleClick() {
    setStatus(null);

    const response = await fetch(`/api/workspaces/${workspaceId}/conversations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const body = (await response.json().catch(() => null)) as
      | { error?: string; conversation?: { id: string } }
      | null;

    const conversationId = body?.conversation?.id;
    if (!response.ok || !conversationId) {
      setStatus(body?.error ?? "创建会话失败");
      return;
    }

    startTransition(() => {
      router.push(`/workspaces/${workspaceId}?conversationId=${conversationId}`);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-2">
      <button className={buttonStyles()} disabled={isPending} onClick={handleClick} type="button">
        {isPending ? "进入中..." : label}
      </button>
      {status ? <p className={ui.error}>{status}</p> : null}
    </div>
  );
}
