"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ActionDialog } from "@/components/shared/action-dialog";
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
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isBusy = isSubmitting || isPending;

  async function handleDelete() {
    setStatus(null);
    setIsSubmitting(true);

    try {
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

      setIsDeleteDialogOpen(false);

      startTransition(() => {
        router.push(`/workspaces/${workspaceId}`);
        router.refresh();
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div className="grid gap-2">
        <button
          className={buttonStyles({ variant: "danger", block: true })}
          disabled={isBusy}
          onClick={() => {
            setStatus(null);
            setIsDeleteDialogOpen(true);
          }}
          type="button"
        >
          {isBusy ? "处理中..." : "删除文档"}
        </button>
        {status ? <p className={ui.error}>{status}</p> : null}
      </div>

      <ActionDialog
        open={isDeleteDialogOpen}
        tone="danger"
        role="alertdialog"
        title="删除文档"
        description="会同时移除文档版本、索引和上传文件。已在回答中出现的引用链接也会随之失效。"
        error={status}
        confirmLabel="确认删除"
        pendingLabel="删除中..."
        onClose={() => {
          if (!isBusy) {
            setIsDeleteDialogOpen(false);
          }
        }}
        onConfirm={() => {
          void handleDelete();
        }}
        isSubmitting={isBusy}
      />
    </>
  );
}
