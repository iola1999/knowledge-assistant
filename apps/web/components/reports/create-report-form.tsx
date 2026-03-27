"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function CreateReportForm({
  workspaceId,
  conversationId,
}: {
  workspaceId: string;
  conversationId?: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    const response = await fetch(`/api/workspaces/${workspaceId}/reports`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: title.trim() || undefined,
        conversationId,
      }),
    });

    const body = (await response.json().catch(() => null)) as
      | { error?: string; report?: { id: string } }
      | null;

    const reportId = body?.report?.id;

    if (!response.ok || !reportId) {
      setStatus(body?.error ?? "创建报告失败");
      return;
    }

    startTransition(() => {
      router.push(`/workspaces/${workspaceId}/reports/${reportId}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="card form">
      <h3>新建报告</h3>
      <label>
        报告标题
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="例如：供应商合同审查意见"
        />
      </label>
      <button disabled={isPending} type="submit">
        {isPending ? "跳转中..." : "创建报告"}
      </button>
      {status ? <p>{status}</p> : null}
    </form>
  );
}
