"use client";

import { useEffect, useRef, useState } from "react";

import { ShareIcon } from "@/components/icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shared/popover";
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

  function handleOpenChange(nextOpen: boolean) {
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
    <Popover
      open={open}
      onOpenChange={handleOpenChange}
      placement="bottom-end"
      sideOffset={10}
      collisionPadding={12}
    >
      <PopoverTrigger asChild>
        <button
          aria-controls={panelId}
          aria-expanded={open}
          aria-haspopup="dialog"
          className={cn(
            buttonStyles({ size: "sm" }),
            "gap-2 rounded-[18px] px-3.5 shadow-sm hover:bg-[#25211c] min-[720px]:gap-2.5 min-[720px]:px-4",
          )}
          disabled={isSubmitting}
          type="button"
        >
          <ShareIcon aria-hidden="true" className="size-[18px]" strokeWidth={1.85} />
          分享
        </button>
      </PopoverTrigger>

      <PopoverContent
        id={panelId}
        aria-label="会话分享"
        className="z-20 w-[min(320px,calc(100vw-24px))] overflow-hidden"
      >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-3 pb-1 pt-2.5">
            <div className="grid gap-0.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-app-accent">
                公开分享
              </p>
              <strong className="text-[13px] text-app-text">{shareStateLabel}</strong>
            </div>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                share?.isActive
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : isLoading
                    ? "border-app-border bg-app-surface-soft text-app-muted-strong"
                    : "border-app-border bg-white/86 text-app-muted-strong",
              )}
            >
              {shareStateBadge}
            </span>
          </div>

          <div className="mx-2 my-1.5 h-px bg-app-border/70" />

          {/* Meta / timestamps */}
          {shareCreatedLabel || shareUpdatedLabel ? (
            <>
              <dl className="grid gap-0.5 px-3 py-1">
                {shareCreatedLabel ? (
                  <div className="flex items-center justify-between gap-4 py-0.5 text-[13px]">
                    <dt className="text-app-muted-strong">创建分享</dt>
                    <dd className="text-right font-medium text-app-text">{shareCreatedLabel}</dd>
                  </div>
                ) : null}
                {shareUpdatedLabel ? (
                  <div className="flex items-center justify-between gap-4 py-0.5 text-[13px]">
                    <dt className="text-app-muted-strong">最近变更</dt>
                    <dd className="text-right font-medium text-app-text">{shareUpdatedLabel}</dd>
                  </div>
                ) : null}
              </dl>
              <div className="mx-2 my-1.5 h-px bg-app-border/70" />
            </>
          ) : null}

          {/* Actions */}
          {isLoading ? (
            <div className="px-3 py-2.5 text-[13px] text-app-muted">加载中</div>
          ) : !share ? (
            <div className="grid gap-2.5 px-3 py-2.5">
              <p className={cn(ui.error, "text-[13px] leading-5")}>
                {error ?? "加载分享状态失败"}
              </p>
              <button
                className={buttonStyles({ variant: "secondary", size: "xs" })}
                disabled={isSubmitting}
                onClick={() => {
                  void loadShare({ reset: true });
                }}
                type="button"
              >
                重试
              </button>
            </div>
          ) : share?.isActive ? (
            <div className="grid gap-2.5 px-3 py-2.5">
              <label className="grid gap-1.5 text-[12px] font-medium text-app-muted-strong">
                分享链接
                <input
                  className={cn(inputStyles({ size: "compact" }), "bg-app-surface-soft/80 text-[13px]")}
                  readOnly
                  value={share.shareUrl ?? ""}
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className={buttonStyles({ size: "xs" })}
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
                    className={buttonStyles({ variant: "secondary", size: "xs" })}
                  >
                    打开
                  </a>
                ) : null}
                <button
                  className={buttonStyles({ variant: "dangerGhost", size: "xs" })}
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
                    "inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-[11px] leading-5",
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
            <div className="px-3 py-2.5">
              <button
                className={cn(buttonStyles({ size: "xs", block: true }))}
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
                    "mt-2 inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-[11px] leading-5",
                    noticeClassName,
                  )}
                >
                  {notice.message}
                </p>
              ) : null}
              {error ? (
                <p className={cn(ui.error, "mt-2 text-[13px] leading-5")}>{error}</p>
              ) : null}
            </div>
          )}
      </PopoverContent>
    </Popover>
  );
}
