"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ActionDialog } from "@/components/shared/action-dialog";
import { buttonStyles, cn, ui } from "@/lib/ui";

export function WorkspaceLifecyclePanel({
  workspaceId,
  workspaceTitle,
}: {
  workspaceId: string;
  workspaceTitle: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<{
    tone: "error" | "muted";
    message: string;
  } | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isBusy = isSubmitting || isPending;

  async function deleteWorkspace() {
    setStatus(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "DELETE",
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        setStatus({
          tone: "error",
          message: body?.error ?? "删除工作空间失败",
        });
        return;
      }

      setIsDeleteDialogOpen(false);

      startTransition(() => {
        router.push("/workspaces");
        router.refresh();
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <section className={cn(ui.panelLarge, "grid gap-5 p-6")}>
        <div className="grid gap-2">
          <p className={ui.eyebrow}>Lifecycle</p>
          <h2>删除工作空间</h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={buttonStyles({ variant: "danger" })}
            disabled={isBusy}
            onClick={() => {
              setStatus(null);
              setIsDeleteDialogOpen(true);
            }}
          >
            {isBusy ? "处理中..." : "删除工作空间"}
          </button>
        </div>

        {status ? (
          <p className={status.tone === "error" ? ui.error : ui.muted}>{status.message}</p>
        ) : null}
      </section>

      <ActionDialog
        open={isDeleteDialogOpen}
        tone="danger"
        role="alertdialog"
        title={`删除空间「${workspaceTitle}」`}
        error={status?.tone === "error" ? status.message : null}
        confirmLabel="确认删除"
        pendingLabel="删除中..."
        onClose={() => {
          if (!isBusy) {
            setIsDeleteDialogOpen(false);
          }
        }}
        onConfirm={() => {
          void deleteWorkspace();
        }}
        isSubmitting={isBusy}
      />
    </>
  );
}
