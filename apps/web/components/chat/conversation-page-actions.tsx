"use client";

import { CONVERSATION_STATUS, type ConversationStatus } from "@anchordesk/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  MoreHorizontalIcon,
  TrashIcon,
} from "@/components/icons";
import { ui } from "@/lib/ui";
import { ConversationSharePopover } from "@/components/chat/conversation-share-popover";
import { ActionDialog } from "@/components/shared/action-dialog";
import { formatConversationMetaTimestamp } from "@/lib/api/conversations";

function resolveConversationStatusLabel(status: ConversationStatus) {
  return status === CONVERSATION_STATUS.ARCHIVED ? "已归档" : "进行中";
}

export function ConversationPageActions({
  conversationId,
  workspaceId,
  conversationTitle,
  conversationStatus,
  createdAt,
  updatedAt,
  creatorLabel,
  messageCount,
  attachmentCount,
}: {
  conversationId: string;
  workspaceId: string;
  conversationTitle: string;
  conversationStatus: ConversationStatus;
  createdAt: Date;
  updatedAt: Date;
  creatorLabel: string;
  messageCount: number;
  attachmentCount: number;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isBusy = isSubmitting || isPending;
  const menuId = `conversation-actions-${conversationId}`;

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (!containerRef.current?.contains(event.target)) {
        setIsMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  async function handleDelete() {
    setStatus(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: "DELETE",
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        setStatus(body?.error ?? "删除会话失败。");
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
      <div ref={containerRef} className="relative flex flex-wrap items-center justify-end gap-2">
        <button
          aria-controls={menuId}
          aria-expanded={isMenuOpen}
          aria-haspopup="dialog"
          className="inline-flex size-9 items-center justify-center rounded-[16px] bg-transparent text-app-muted-strong transition hover:bg-app-surface-soft hover:text-app-text focus:outline-none focus:ring-4 focus:ring-app-accent/10 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy}
          onClick={() => {
            setIsMenuOpen((current) => !current);
          }}
          type="button"
        >
          <MoreHorizontalIcon className="size-[18px]" aria-hidden="true" />
        </button>
        <ConversationSharePopover conversationId={conversationId} />

        {isMenuOpen ? (
          <div
            id={menuId}
            role="dialog"
            aria-label="当前会话信息与更多操作"
            className="absolute right-0 top-[calc(100%+10px)] z-20 w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-[28px] border border-app-border bg-white/98 shadow-card backdrop-blur-md"
          >
            <div className="grid gap-5 p-5">
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <p className={ui.eyebrow}>当前会话</p>
                  <h2 className="text-[1.85rem] font-semibold leading-[1.22] tracking-[-0.03em] text-app-text">
                    {conversationTitle}
                  </h2>
                </div>

                <dl className="grid gap-3 rounded-[22px] border border-app-border/70 bg-app-surface-soft/72 p-3.5">
                  <div className="flex items-center justify-between gap-4 text-[14px]">
                    <dt className="text-app-muted-strong">创建者</dt>
                    <dd className="text-right font-medium text-app-text">{creatorLabel}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-[14px]">
                    <dt className="text-app-muted-strong">创建于</dt>
                    <dd className="text-right font-medium text-app-text">
                      {formatConversationMetaTimestamp(createdAt)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-[14px]">
                    <dt className="text-app-muted-strong">最后更新</dt>
                    <dd className="text-right font-medium text-app-text">
                      {formatConversationMetaTimestamp(updatedAt)}
                    </dd>
                  </div>
                </dl>

                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full border border-app-border bg-white/86 px-3 py-1 text-[12px] font-medium text-app-muted-strong">
                    {resolveConversationStatusLabel(conversationStatus)}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-app-border bg-white/86 px-3 py-1 text-[12px] font-medium text-app-muted-strong">
                    {messageCount} 条消息
                  </span>
                  <span className="inline-flex items-center rounded-full border border-app-border bg-white/86 px-3 py-1 text-[12px] font-medium text-app-muted-strong">
                    {attachmentCount > 0 ? `${attachmentCount} 个附件` : "无附件"}
                  </span>
                </div>
              </div>

              <div className="border-t border-app-border/70 pt-4">
                <button
                  className="flex w-full items-center gap-3 rounded-[18px] border border-red-100 bg-red-50/72 px-3.5 py-3 text-left text-[15px] font-medium text-red-700 transition hover:border-red-200 hover:bg-red-50 focus:outline-none focus:ring-4 focus:ring-red-100"
                  disabled={isBusy}
                  onClick={() => {
                    setIsMenuOpen(false);
                    setStatus(null);
                    setIsDeleteDialogOpen(true);
                  }}
                  type="button"
                >
                  <TrashIcon aria-hidden="true" className="size-[18px]" />
                  删除会话
                </button>
                {status ? <p className="mt-3 text-sm leading-6 text-red-600">{status}</p> : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <ActionDialog
        open={isDeleteDialogOpen}
        tone="danger"
        role="alertdialog"
        title="删除当前会话"
        description="删除后会一并移除这段对话中的消息和引用记录。这个操作无法撤销。"
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
