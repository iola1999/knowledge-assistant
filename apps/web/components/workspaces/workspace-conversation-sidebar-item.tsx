"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { MoreHorizontalIcon, TrashIcon } from "@/components/icons";
import { ActionDialog } from "@/components/shared/action-dialog";
import {
  formatConversationSidebarUpdatedAt,
  resolveConversationDeleteRedirect,
} from "@/lib/api/conversations";
import { cn, menuItemStyles, ui } from "@/lib/ui";
import { resolveSidebarConversationMenuPosition } from "@/lib/sidebar-menu";

const SIDEBAR_MENU_WIDTH = 156;
const SIDEBAR_MENU_HEIGHT = 52;

type WorkspaceConversationSidebarItemProps = {
  workspaceId: string;
  conversation: {
    id: string;
    title: string;
    updatedAt: Date;
  };
  activeConversationId?: string;
  onNavigate?: () => void;
  alwaysShowMenu?: boolean;
};

export function WorkspaceConversationSidebarItem({
  workspaceId,
  conversation,
  activeConversationId,
  onNavigate,
  alwaysShowMenu = false,
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
      onNavigate?.();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div ref={containerRef} className="group relative">
        <Link
          href={`/workspaces/${workspaceId}?conversationId=${conversation.id}`}
          onClick={onNavigate}
          className={cn(
            "block rounded-2xl px-4 py-3 text-sm transition",
            isActive
              ? "bg-white text-app-text shadow-soft"
              : "text-app-muted-strong hover:bg-white/72 hover:text-app-text",
          )}
        >
          <strong className="block min-w-0 truncate pr-[3.5rem] text-[12px] leading-5 font-medium">
            {conversation.title}
          </strong>
        </Link>

        <span
          className={cn(
            "pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-right text-[11px] text-app-muted transition duration-150",
            isMenuOpen || alwaysShowMenu
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
            "absolute right-2 top-1/2 z-10 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-app-muted-strong transition focus:outline-none focus:ring-4 focus:ring-app-accent/10",
            isMenuOpen || alwaysShowMenu
              ? "bg-white text-app-text shadow-soft"
              : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 hover:bg-white/92 hover:text-app-text",
            alwaysShowMenu && "pointer-events-auto opacity-100",
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
          <MoreHorizontalIcon className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {isMounted && isMenuOpen
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={`${conversation.title} 操作`}
              className={cn(ui.menu, "fixed z-60 min-w-[156px]")}
              style={{
                left: `${menuPosition.left}px`,
                top: `${menuPosition.top}px`,
                width: `${SIDEBAR_MENU_WIDTH}px`,
              }}
            >
              <button
                type="button"
                role="menuitem"
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition",
                  menuItemStyles({ tone: "danger" }),
                )}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setStatus(null);
                  setIsMenuOpen(false);
                  setIsDeleteDialogOpen(true);
                }}
              >
                <TrashIcon aria-hidden="true" />
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
