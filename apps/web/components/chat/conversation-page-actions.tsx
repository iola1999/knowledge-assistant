"use client";

import { CONVERSATION_STATUS, type ConversationStatus } from "@anchordesk/contracts";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  MoreHorizontalIcon,
  TrashIcon,
} from "@/components/icons";
import { cn, menuItemStyles, ui } from "@/lib/ui";
import { ConversationSharePopover } from "@/components/chat/conversation-share-popover";
import { ActionDialog } from "@/components/shared/action-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shared/popover";
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
  const [status, setStatus] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isBusy = isSubmitting || isPending;
  const menuId = `conversation-actions-${conversationId}`;

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
      <div className="relative flex flex-nowrap items-center justify-end gap-1.5 min-[720px]:gap-2">
        <Popover
          open={isMenuOpen}
          onOpenChange={setIsMenuOpen}
          placement="bottom-end"
          sideOffset={10}
          collisionPadding={12}
        >
          <PopoverTrigger asChild>
            <button
              aria-controls={menuId}
              aria-expanded={isMenuOpen}
              aria-haspopup="dialog"
              className="inline-flex size-9 items-center justify-center rounded-xl bg-transparent text-app-muted-strong transition-[background-color,color,transform] duration-200 [transition-timing-function:var(--ease-out-quart)] hover:-translate-y-px hover:bg-app-surface-soft hover:text-app-text focus:outline-none focus:ring-4 focus:ring-app-accent/10 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isBusy}
              onClick={() => {
                setStatus(null);
              }}
              type="button"
            >
              <MoreHorizontalIcon className="size-[18px]" aria-hidden="true" />
            </button>
          </PopoverTrigger>

          <PopoverContent
            id={menuId}
            role="dialog"
            aria-label="当前会话信息与更多操作"
            className="animate-soft-enter z-20 w-[min(320px,calc(100vw-24px))] overflow-hidden"
          >
            {/* Header */}
            <div className="px-3 pb-1 pt-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-app-accent">当前会话</p>
              <h2 className="mt-1 truncate text-[15px] font-semibold leading-snug text-app-text">
                {conversationTitle}
              </h2>
            </div>

            <div className="mx-2 my-1.5 h-px bg-app-border/70" />

            {/* Meta rows */}
            <dl className="grid gap-0.5 px-3 py-1">
              <div className="flex items-center justify-between gap-4 py-0.5 text-[13px]">
                <dt className="text-app-muted-strong">创建者</dt>
                <dd className="text-right font-medium text-app-text">{creatorLabel}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-0.5 text-[13px]">
                <dt className="text-app-muted-strong">创建于</dt>
                <dd className="text-right font-medium text-app-text">
                  {formatConversationMetaTimestamp(createdAt)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-0.5 text-[13px]">
                <dt className="text-app-muted-strong">最后更新</dt>
                <dd className="text-right font-medium text-app-text">
                  {formatConversationMetaTimestamp(updatedAt)}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-1.5 px-3 pb-1 pt-1">
              <span className="inline-flex items-center rounded-full border border-app-border bg-white/86 px-2.5 py-0.5 text-[11px] font-medium text-app-muted-strong">
                {resolveConversationStatusLabel(conversationStatus)}
              </span>
              <span className="inline-flex items-center rounded-full border border-app-border bg-white/86 px-2.5 py-0.5 text-[11px] font-medium text-app-muted-strong">
                {messageCount} 条消息
              </span>
              <span className="inline-flex items-center rounded-full border border-app-border bg-white/86 px-2.5 py-0.5 text-[11px] font-medium text-app-muted-strong">
                {attachmentCount > 0 ? `${attachmentCount} 个附件` : "无附件"}
              </span>
            </div>

            <div className="mx-2 my-1.5 h-px bg-app-border/70" />

            {/* Delete action */}
            <div className="pb-0.5 pt-0.5">
              <button
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition",
                  menuItemStyles({ tone: "danger" }),
                )}
                disabled={isBusy}
                onClick={() => {
                  setIsMenuOpen(false);
                  setStatus(null);
                  setIsDeleteDialogOpen(true);
                }}
                type="button"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-lg text-red-500">
                  <TrashIcon aria-hidden="true" className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">删除会话</span>
              </button>
              {status ? <p className="px-3 pb-1 text-sm leading-6 text-red-600">{status}</p> : null}
            </div>
          </PopoverContent>
        </Popover>

        <ConversationSharePopover
          conversationId={conversationId}
          onOpen={() => setIsMenuOpen(false)}
        />
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
