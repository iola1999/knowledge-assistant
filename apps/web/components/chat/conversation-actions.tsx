"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CONVERSATION_STATUS, type ConversationStatus } from "@anchordesk/contracts";

import { TextPromptDialog } from "@/components/shared/action-dialog";
import { canSubmitDialogText, normalizeDialogText } from "@/lib/dialog";
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
  status: ConversationStatus;
  isActive: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isBusy = isSubmitting || isPending;

  async function updateConversation(patch: Record<string, unknown>, nextHref?: string) {
    setError(null);
    setIsSubmitting(true);

    try {
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
        return false;
      }

      startTransition(() => {
        if (nextHref) {
          router.push(nextHref);
        }
        router.refresh();
      });

      return true;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRename() {
    const nextTitle = normalizeDialogText(draftTitle);
    if (
      !canSubmitDialogText({
        value: nextTitle,
        initialValue: title,
        requireChange: true,
      })
    ) {
      return;
    }

    const updated = await updateConversation({ title: nextTitle });
    if (updated) {
      setIsRenameDialogOpen(false);
    }
  }

  async function handleArchiveToggle() {
    const nextStatus =
      status === CONVERSATION_STATUS.ACTIVE
        ? CONVERSATION_STATUS.ARCHIVED
        : CONVERSATION_STATUS.ACTIVE;
    const nextHref =
      status === CONVERSATION_STATUS.ACTIVE && isActive
        ? `/workspaces/${workspaceId}`
        : undefined;

    await updateConversation({ status: nextStatus }, nextHref);
  }

  const canSubmitRename = canSubmitDialogText({
    value: draftTitle,
    initialValue: title,
    requireChange: true,
  });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className={buttonStyles({ variant: "secondary", size: "sm" })}
          disabled={isBusy}
          onClick={() => {
            setError(null);
            setDraftTitle(title);
            setIsRenameDialogOpen(true);
          }}
          type="button"
        >
          重命名
        </button>
        <button
          className={buttonStyles({ variant: "secondary", size: "sm" })}
          disabled={isBusy}
          onClick={() => {
            void handleArchiveToggle();
          }}
          type="button"
        >
          {status === CONVERSATION_STATUS.ACTIVE ? "归档" : "恢复"}
        </button>
        {error ? <span className={ui.error}>{error}</span> : null}
      </div>

      <TextPromptDialog
        open={isRenameDialogOpen}
        title="重命名会话"
        description="新名称会显示在左侧历史中，建议直接写主题，方便后续检索。"
        label="会话名称"
        value={draftTitle}
        placeholder="例如：发布节奏复盘"
        hint="会话名称只用于识别历史记录，不会影响回答内容。"
        error={error}
        confirmLabel="保存名称"
        pendingLabel="保存中..."
        confirmDisabled={!canSubmitRename}
        onClose={() => {
          if (!isBusy) {
            setIsRenameDialogOpen(false);
          }
        }}
        onConfirm={() => {
          void handleRename();
        }}
        onValueChange={setDraftTitle}
        isSubmitting={isBusy}
      />
    </>
  );
}
