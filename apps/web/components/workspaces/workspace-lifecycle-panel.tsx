"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

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
  const [isPending, startTransition] = useTransition();

  async function deleteWorkspace() {
    const confirmed = window.confirm(
      `确认删除工作空间「${workspaceTitle}」？删除为软删除，当前不提供恢复入口`,
    );
    if (!confirmed) {
      return;
    }

    setStatus(null);

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

    startTransition(() => {
      router.push("/workspaces");
      router.refresh();
    });
  }

  return (
    <section className={cn(ui.panelLarge, "grid gap-5 p-6")}>
      <div className="grid gap-2">
        <p className={ui.eyebrow}>Lifecycle</p>
        <h2>删除工作空间</h2>
        <p className={ui.muted}>
          删除采用软删除：空间会从默认列表中隐藏，当前不提供恢复入口
        </p>
      </div>

      <div className={cn(ui.subcard, "grid gap-2")}>
        <strong className="text-sm">删除后将隐藏整个工作空间</strong>
        <p className={ui.muted}>
          资料、会话和报告会跟随工作空间一起变为不可访问，但底层数据会保留为软删除状态
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={buttonStyles({ variant: "danger" })}
          disabled={isPending}
          onClick={() => void deleteWorkspace()}
        >
          {isPending ? "处理中..." : "删除工作空间"}
        </button>
      </div>

      {status ? (
        <p className={status.tone === "error" ? ui.error : ui.muted}>{status.message}</p>
      ) : null}
    </section>
  );
}
