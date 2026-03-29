"use client";

import { useEffect, useState } from "react";

import { MESSAGE_STATUS, TIMELINE_EVENT, type MessageStatus } from "@knowledge-assistant/contracts";

import {
  canShowAssistantProcess,
  describeAssistantProcessSummary,
} from "@/lib/api/conversation-process";
import { cn, ui } from "@/lib/ui";

type TimelineMessage = {
  id: string;
  status: MessageStatus;
  contentMarkdown: string;
  createdAt: string;
  structuredJson?: Record<string, unknown> | null;
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function getTimelineTone(message: TimelineMessage) {
  const event = String(message.structuredJson?.timeline_event ?? "");

  if (message.status === MESSAGE_STATUS.FAILED || event === TIMELINE_EVENT.TOOL_FAILED) {
    return "border-red-200/80 bg-red-50/70 text-red-700";
  }

  if (
    message.status === MESSAGE_STATUS.STREAMING ||
    event === TIMELINE_EVENT.TOOL_STARTED
  ) {
    return "border-amber-200/80 bg-amber-50/70 text-amber-800";
  }

  return "border-emerald-200/80 bg-emerald-50/70 text-emerald-800";
}

export function ConversationTimeline({
  timelineMessages,
  runtimeStatus,
  defaultOpen = false,
}: {
  timelineMessages: TimelineMessage[];
  runtimeStatus?: string | null;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  const summary = describeAssistantProcessSummary({
    stepCount: timelineMessages.length,
    isStreaming: defaultOpen,
    runtimeStatus,
  });

  if (
    !canShowAssistantProcess({
      stepCount: timelineMessages.length,
      isStreaming: defaultOpen,
    }) ||
    !summary
  ) {
    return null;
  }

  return (
    <details
      className="group rounded-[22px] border border-app-border/60 bg-white/68 px-4 py-3 shadow-[0_8px_24px_rgba(23,22,18,0.035)]"
      open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm text-app-muted-strong">
        <span className="inline-flex items-center gap-2 font-medium text-app-text">
          <span className="text-base leading-none transition group-open:rotate-90">›</span>
          {summary}
        </span>
        {runtimeStatus && open ? (
          <span className="text-[12px] text-app-muted">{runtimeStatus}</span>
        ) : null}
      </summary>

      {timelineMessages.length > 0 ? (
        <div className="mt-3 grid gap-2.5 border-t border-app-border/55 pt-3">
          {timelineMessages.map((message) => (
            <article
              key={message.id}
              className="grid gap-2 rounded-[18px] border border-app-border/50 bg-app-surface-soft/72 px-3.5 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium",
                    getTimelineTone(message),
                  )}
                >
                  {message.status === MESSAGE_STATUS.STREAMING
                    ? "进行中"
                    : message.status === MESSAGE_STATUS.FAILED
                      ? "失败"
                      : "完成"}
                </span>
                <span className="text-[12px] text-app-muted">{formatTime(message.createdAt)}</span>
              </div>
              <div className="text-[13px] leading-6 text-app-muted-strong">{message.contentMarkdown}</div>
            </article>
          ))}
        </div>
      ) : null}

      {timelineMessages.length === 0 && runtimeStatus ? (
        <p className={cn(ui.muted, "mt-3 border-t border-app-border/55 pt-3 text-[13px]")}>
          {runtimeStatus}
        </p>
      ) : null}
    </details>
  );
}
