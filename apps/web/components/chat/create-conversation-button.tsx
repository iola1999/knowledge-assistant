"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function CreateConversationButton({
  workspaceId,
}: {
  workspaceId: string;
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
    <div className="stack">
      <button disabled={isPending} onClick={handleClick} type="button">
        {isPending ? "进入中..." : "新建对话"}
      </button>
      {status ? <p className="error">{status}</p> : null}
    </div>
  );
}
