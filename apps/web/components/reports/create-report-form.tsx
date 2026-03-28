"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { buttonStyles, cn, ui } from "@/lib/ui";

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
    <form onSubmit={onSubmit} className={cn(ui.panel, "grid gap-4")}>
      <h3>新建报告</h3>
      <label className={ui.label}>
        报告标题
        <input
          className={ui.input}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="例如：供应商合同审查意见"
        />
      </label>
      <button className={buttonStyles()} disabled={isPending} type="submit">
        {isPending ? "跳转中..." : "创建报告"}
      </button>
      {status ? <p className={ui.muted}>{status}</p> : null}
    </form>
  );
}
