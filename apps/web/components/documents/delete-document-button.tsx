"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { buttonStyles, ui } from "@/lib/ui";

export function DeleteDocumentButton({
  workspaceId,
  documentId,
}: {
  workspaceId: string;
  documentId: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleDelete() {
    setStatus(null);
    if (!window.confirm("确认删除该文档及其版本、索引和上传文件吗？")) {
      return;
    }

    const response = await fetch(
      `/api/workspaces/${workspaceId}/documents/${documentId}`,
      {
        method: "DELETE",
      },
    );
    const body = (await response.json().catch(() => null)) as
      | { error?: string; ok?: boolean }
      | null;

    if (!response.ok || !body?.ok) {
      setStatus(body?.error ?? "删除文档失败");
      return;
    }

    startTransition(() => {
      router.push(`/workspaces/${workspaceId}`);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-2">
      <button
        className={buttonStyles({ variant: "danger" })}
        disabled={isPending}
        onClick={handleDelete}
        type="button"
      >
        {isPending ? "返回中..." : "删除文档"}
      </button>
      {status ? <p className={ui.error}>{status}</p> : null}
    </div>
  );
}
