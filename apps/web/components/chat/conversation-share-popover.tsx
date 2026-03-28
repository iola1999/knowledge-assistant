"use client";

import { useEffect, useRef, useState } from "react";

import { buttonStyles, cn, ui } from "@/lib/ui";

type ShareState = {
  isActive: boolean;
  shareUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  revokedAt: string | null;
};

export function ConversationSharePopover({
  conversationId,
}: {
  conversationId: string;
}) {
  const panelId = `conversation-share-${conversationId}`;
  const [open, setOpen] = useState(false);
  const [share, setShare] = useState<ShareState | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void loadShare();

    return () => {
      loadControllerRef.current?.abort();
    };
  }, [conversationId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function loadShare({ reset = false }: { reset?: boolean } = {}) {
    loadControllerRef.current?.abort();
    const controller = new AbortController();
    loadControllerRef.current = controller;

    setIsLoading(true);
    setError(null);
    if (reset) {
      setShare(null);
    }

    try {
      const response = await fetch(`/api/conversations/${conversationId}/share`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; share?: ShareState }
        | null;

      if (controller.signal.aborted) {
        return;
      }

      if (!response.ok || !body?.share) {
        setError(body?.error ?? "加载分享状态失败");
        return;
      }

      setShare(body.share);
    } catch (fetchError) {
      if (
        fetchError instanceof DOMException &&
        fetchError.name === "AbortError"
      ) {
        return;
      }

      setError("加载分享状态失败");
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }

      if (loadControllerRef.current === controller) {
        loadControllerRef.current = null;
      }
    }
  }

  function handleToggleOpen() {
    const nextOpen = !open;
    setOpen(nextOpen);
    setStatus(null);

    if (nextOpen && !share && !isLoading) {
      void loadShare({ reset: Boolean(error) });
    }
  }

  async function handleEnableShare() {
    setIsSubmitting(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch(`/api/conversations/${conversationId}/share`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; share?: ShareState }
        | null;

      if (!response.ok || !body?.share) {
        setError(body?.error ?? "开启分享失败");
        return;
      }

      setShare(body.share);
      setStatus("公开分享已开启");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDisableShare() {
    setIsSubmitting(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch(`/api/conversations/${conversationId}/share`, {
        method: "DELETE",
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; share?: ShareState }
        | null;

      if (!response.ok || !body?.share) {
        setError(body?.error ?? "关闭分享失败");
        return;
      }

      setShare(body.share);
      setStatus("分享已关闭");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCopyLink() {
    if (!share?.shareUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(share.shareUrl);
      setStatus("分享链接已复制");
      setError(null);
    } catch {
      setError("复制链接失败");
    }
  }

  const shareStateLabel = isLoading
    ? "加载中"
    : !share && error
      ? "读取失败"
      : share?.isActive
        ? "已开启"
        : "未开启";
  const shareStateBadge = isLoading ? "处理中" : share?.isActive ? "公开" : "私密";

  return (
    <div ref={containerRef} className="relative">
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={buttonStyles({ variant: "secondary", size: "sm" })}
        disabled={isSubmitting}
        onClick={() => {
          void handleToggleOpen();
        }}
        type="button"
      >
        分享
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="会话分享"
          className="absolute right-0 top-[calc(100%+10px)] z-20 w-[min(360px,calc(100vw-24px))] rounded-[26px] border border-app-border bg-white/98 p-3 shadow-card"
        >
          <div className="grid gap-3 rounded-[22px] border border-app-border bg-app-surface-soft/75 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="grid gap-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-app-muted">
                  公开分享
                </p>
                <strong className="text-sm text-app-text">{shareStateLabel}</strong>
              </div>
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2.5 py-1 text-[12px] font-medium",
                  share?.isActive
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : isLoading
                      ? "border-app-border bg-app-surface-soft text-app-muted-strong"
                      : "border-app-border bg-white text-app-muted-strong",
                )}
              >
                {shareStateBadge}
              </span>
            </div>
            <p className="text-[13px] leading-5 text-app-muted">
              持有链接的人可直接查看会话，资料引用不提供跳转
            </p>
          </div>

          {isLoading ? (
            <div className="px-1 py-3 text-[13px] text-app-muted">加载中</div>
          ) : !share ? (
            <div className="grid gap-3 px-1 py-2">
              <p className={cn(ui.error, "text-[13px] leading-5")}>
                {error ?? "加载分享状态失败"}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className={buttonStyles({ variant: "secondary", size: "sm" })}
                  disabled={isSubmitting}
                  onClick={() => {
                    void loadShare({ reset: true });
                  }}
                  type="button"
                >
                  重试
                </button>
              </div>
            </div>
          ) : share?.isActive ? (
            <div className="grid gap-3 px-1 pt-3">
              <label className="grid gap-2 text-[12px] font-medium text-app-muted-strong">
                分享链接
                <input
                  className="h-10 w-full rounded-2xl border border-app-border bg-app-surface-soft/80 px-3 text-[13px] text-app-text outline-none"
                  readOnly
                  value={share.shareUrl ?? ""}
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className={buttonStyles({ size: "sm" })}
                  disabled={isSubmitting}
                  onClick={() => {
                    void handleCopyLink();
                  }}
                  type="button"
                >
                  复制链接
                </button>
                {share.shareUrl ? (
                  <a
                    href={share.shareUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonStyles({ variant: "secondary", size: "sm" })}
                  >
                    打开
                  </a>
                ) : null}
                <button
                  className={cn(
                    buttonStyles({ variant: "ghost", size: "sm" }),
                    "text-red-600 hover:bg-red-50",
                  )}
                  disabled={isSubmitting}
                  onClick={() => {
                    void handleDisableShare();
                  }}
                  type="button"
                >
                  关闭分享
                </button>
              </div>
              {status ? (
                <p className={cn(ui.muted, "text-[13px] leading-5")}>{status}</p>
              ) : null}
              {error ? (
                <p className={cn(ui.error, "text-[13px] leading-5")}>{error}</p>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-3 px-1 pt-3">
              <button
                className={buttonStyles({ size: "sm" })}
                disabled={isSubmitting}
                onClick={() => {
                  void handleEnableShare();
                }}
                type="button"
              >
                创建分享链接
              </button>
              {status ? (
                <p className={cn(ui.muted, "text-[13px] leading-5")}>{status}</p>
              ) : null}
              {error ? (
                <p className={cn(ui.error, "text-[13px] leading-5")}>{error}</p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
