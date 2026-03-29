"use client";

import { useEffect, useRef, useState } from "react";

import { ShareIcon } from "@/components/icons";
import {
  buildCopyShareNotice,
  buildEnableShareNotice,
  SHARE_NOTICE_AUTO_DISMISS_MS,
  type ShareNotice,
} from "@/lib/api/conversation-share-feedback";
import { formatConversationMetaTimestamp } from "@/lib/api/conversations";
import { buttonStyles, cn, inputStyles, ui } from "@/lib/ui";

type ShareState = {
  isActive: boolean;
  shareUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  revokedAt: string | null;
};

export function ConversationSharePopover({
  conversationId,
  onOpen,
}: {
  conversationId: string;
  onOpen?: () => void;
}) {
  const panelId = `conversation-share-${conversationId}`;
  const [open, setOpen] = useState(false);
  const [share, setShare] = useState<ShareState | null>(null);
  const [notice, setNotice] = useState<ShareNotice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadControllerRef = useRef<AbortController | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    void loadShare();

    return () => {
      loadControllerRef.current?.abort();
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, [conversationId]);

  useEffect(() => {
    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }

    if (!notice?.autoDismiss) {
      return;
    }

    noticeTimerRef.current = window.setTimeout(() => {
      setNotice((current) => (current === notice ? null : current));
      noticeTimerRef.current = null;
    }, SHARE_NOTICE_AUTO_DISMISS_MS);

    return () => {
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = null;
      }
    };
  }, [notice]);

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
    setNotice(null);

    if (nextOpen) {
      onOpen?.();
      if (!share && !isLoading) {
        void loadShare({ reset: Boolean(error) });
      }
    }
  }

  async function copyShareUrl(value: string) {
    if (!navigator.clipboard?.writeText) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  }

  async function handleEnableShare() {
    setIsSubmitting(true);
    setError(null);
    setNotice(null);

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
      const copySucceeded = body.share.shareUrl
        ? await copyShareUrl(body.share.shareUrl)
        : false;
      setNotice(
        buildEnableShareNotice({
          shareUrl: body.share.shareUrl,
          copySucceeded,
        }),
      );
    } catch {
      setError("开启分享失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDisableShare() {
    setIsSubmitting(true);
    setError(null);
    setNotice(null);

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
      setNotice({
        tone: "success",
        message: "分享已关闭",
        autoDismiss: true,
      });
    } catch {
      setError("关闭分享失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCopyLink() {
    if (!share?.shareUrl) {
      return;
    }

    setError(null);
    setNotice(buildCopyShareNotice(await copyShareUrl(share.shareUrl)));
  }

  const shareStateLabel = isLoading
    ? "加载中"
    : !share && error
      ? "读取失败"
      : share?.isActive
        ? "已开启"
        : "未开启";
  const shareStateBadge = isLoading ? "处理中" : share?.isActive ? "公开" : "私密";
  const noticeClassName = notice?.tone === "error"
    ? "border-red-200 bg-red-50/80 text-red-700"
    : "border-emerald-200 bg-emerald-50/80 text-emerald-800";
  const shareCreatedLabel = share?.createdAt
    ? formatConversationMetaTimestamp(new Date(share.createdAt))
    : null;
  const shareUpdatedLabel = share?.updatedAt
    ? formatConversationMetaTimestamp(new Date(share.updatedAt))
    : null;

  return (
    <div ref={containerRef} className="relative">
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          buttonStyles({ size: "sm" }),
          "gap-2.5 rounded-[18px] px-4 shadow-sm hover:bg-[#25211c]",
        )}
        disabled={isSubmitting}
        onClick={() => {
          void handleToggleOpen();
        }}
        type="button"
      >
        <ShareIcon aria-hidden="true" className="size-[18px]" strokeWidth={1.85} />
        分享
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="会话分享"
          className={cn(ui.popover, "absolute right-0 top-[calc(100%+10px)] z-20 w-[min(360px,calc(100vw-24px))]")}
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
            {shareCreatedLabel || shareUpdatedLabel ? (
              <dl className="grid gap-2 rounded-[18px] border border-app-border/70 bg-white/82 p-3 text-[12px] text-app-muted-strong">
                {shareCreatedLabel ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt>创建分享</dt>
                    <dd className="text-right text-app-text">{shareCreatedLabel}</dd>
                  </div>
                ) : null}
                {shareUpdatedLabel ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt>最近变更</dt>
                    <dd className="text-right text-app-text">{shareUpdatedLabel}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
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
                  className={cn(inputStyles({ size: "compact" }), "bg-app-surface-soft/80 text-[13px]")}
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
                  className={buttonStyles({ variant: "dangerGhost", size: "sm" })}
                  disabled={isSubmitting}
                  onClick={() => {
                    void handleDisableShare();
                  }}
                  type="button"
                >
                  关闭分享
                </button>
              </div>
              {notice ? (
                <p
                  aria-live="polite"
                  className={cn(
                    "inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[12px] leading-5",
                    noticeClassName,
                  )}
                >
                  {notice.message}
                </p>
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
              {notice ? (
                <p
                  aria-live="polite"
                  className={cn(
                    "inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[12px] leading-5",
                    noticeClassName,
                  )}
                >
                  {notice.message}
                </p>
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
