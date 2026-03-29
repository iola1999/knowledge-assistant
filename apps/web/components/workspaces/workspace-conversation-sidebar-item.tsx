"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { ActionDialog } from "@/components/shared/action-dialog";
import {
  formatConversationSidebarUpdatedAt,
  resolveConversationDeleteRedirect,
} from "@/lib/api/conversations";
import { cn } from "@/lib/ui";
import { resolveSidebarConversationMenuPosition } from "@/lib/sidebar-menu";

const SIDEBAR_MENU_WIDTH = 156;
const SIDEBAR_MENU_HEIGHT = 62;

type WorkspaceConversationSidebarItemProps = {
  workspaceId: string;
  conversation: {
    id: string;
    title: string;
    updatedAt: Date;
  };
  activeConversationId?: string;
};

export function WorkspaceConversationSidebarItem({
  workspaceId,
  conversation,
  activeConversationId,
}: WorkspaceConversationSidebarItemProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isBusy = isSubmitting || isPending;
  const isActive = conversation.id === activeConversationId;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  function updateMenuPosition() {
    if (!buttonRef.current || typeof window === "undefined") {
      return;
    }

    const triggerRect = buttonRef.current.getBoundingClientRect();
    setMenuPosition(
      resolveSidebarConversationMenuPosition({
        triggerRect: {
          top: triggerRect.top,
          right: triggerRect.right,
          height: triggerRect.height,
        },
        menuWidth: SIDEBAR_MENU_WIDTH,
        menuHeight: SIDEBAR_MENU_HEIGHT,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }),
    );
  }

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    updateMenuPosition();

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setIsMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    }

    function handleViewportChange() {
      updateMenuPosition();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isMenuOpen]);

  async function handleDelete() {
    setStatus(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/conversations/${conversation.id}`, {
        method: "DELETE",
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        setStatus(body?.error ?? "删除会话失败。");
        return;
      }

      const nextHref = resolveConversationDeleteRedirect({
        workspaceId,
        deletedConversationId: conversation.id,
        activeConversationId,
      });

      setIsDeleteDialogOpen(false);
      setIsMenuOpen(false);

      startTransition(() => {
        if (nextHref) {
          router.push(nextHref);
        }
        router.refresh();
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div ref={containerRef} className="group relative">
        <Link
          href={`/workspaces/${workspaceId}?conversationId=${conversation.id}`}
          className={cn(
            "block rounded-2xl px-4 py-3 text-sm transition",
            isActive
              ? "bg-white text-app-text shadow-soft"
              : "text-app-muted-strong hover:bg-white/72 hover:text-app-text",
          )}
        >
          <strong className="block min-w-0 truncate pr-24 text-[15px] font-medium">
            {conversation.title}
          </strong>
        </Link>

        <span
          className={cn(
            "pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-right text-[12px] text-app-muted transition duration-150",
            isMenuOpen
              ? "opacity-0"
              : "opacity-100 group-hover:opacity-0 group-focus-within:opacity-0",
          )}
        >
          {formatConversationSidebarUpdatedAt(conversation.updatedAt)}
        </span>

        <button
          ref={buttonRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          aria-label={`打开「${conversation.title}」操作菜单`}
          className={cn(
            "absolute right-2 top-1/2 z-10 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-app-muted-strong transition focus:outline-none focus:ring-4 focus:ring-app-accent/10",
            isMenuOpen
              ? "bg-white text-app-text shadow-soft"
              : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 hover:bg-white/92 hover:text-app-text",
          )}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setStatus(null);
            setIsMenuOpen((open) => {
              const nextOpen = !open;
              if (nextOpen) {
                updateMenuPosition();
              }
              return nextOpen;
            });
          }}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="h-5 w-5 fill-current"
          >
            <circle cx="4" cy="10" r="1.6" />
            <circle cx="10" cy="10" r="1.6" />
            <circle cx="16" cy="10" r="1.6" />
          </svg>
        </button>
      </div>

      {isMounted && isMenuOpen
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={`${conversation.title} 操作`}
              className="fixed z-40 min-w-[156px] rounded-[20px] border border-app-border bg-white/98 p-2 shadow-card"
              style={{
                left: `${menuPosition.left}px`,
                top: `${menuPosition.top}px`,
                width: `${SIDEBAR_MENU_WIDTH}px`,
              }}
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setStatus(null);
                  setIsMenuOpen(false);
                  setIsDeleteDialogOpen(true);
                }}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-4 w-4 stroke-current"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                >
                  <path d="M4 7h16" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                  <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
                  <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
                </svg>
                <span>删除</span>
              </button>
            </div>,
            document.body,
          )
        : null}

      <ActionDialog
        open={isDeleteDialogOpen}
        tone="danger"
        role="alertdialog"
        title={`删除会话「${conversation.title}」`}
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
