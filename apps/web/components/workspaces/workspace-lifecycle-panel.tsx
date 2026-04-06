"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ActionDialog } from "@/components/shared/action-dialog";
import { useMessage } from "@/components/shared/message-provider";
import { buttonStyles } from "@/lib/ui";

export function WorkspaceLifecyclePanel({
  workspaceId,
  workspaceTitle,
}: {
  workspaceId: string;
  workspaceTitle: string;
}) {
  const router = useRouter();
  const message = useMessage();
  const [status, setStatus] = useState<{ message: string } | null>(null);
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
          message: body?.error ?? "删除工作空间失败",
        });
        return;
      }

      setIsDeleteDialogOpen(false);
      message.success("工作空间已删除");

      startTransition(() => {
        router.push("/workspaces");
        router.refresh();
      });
    } catch (error) {
      setStatus({
        message: error instanceof Error && error.message ? error.message : "删除工作空间失败",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <section className="grid gap-3 rounded-[16px] border border-red-200 bg-red-50/65 px-4 py-4 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-red-600">
              危险操作
            </p>
            <div className="grid gap-1">
              <h2 className="text-[1rem] font-semibold text-app-text">删除工作空间</h2>
              <p className="max-w-[42ch] text-[13px] leading-5 text-app-muted-strong">
                删除后会从工作台隐藏，现有资料和会话不再开放访问
              </p>
            </div>
          </div>

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
      </section>

      <ActionDialog
        open={isDeleteDialogOpen}
        tone="danger"
        role="alertdialog"
        title={`删除空间「${workspaceTitle}」`}
        error={status?.message ?? null}
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
