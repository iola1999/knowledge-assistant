"use client";

import { useEffect, useState } from "react";

import { MESSAGE_STATUS, type MessageStatus } from "@anchordesk/contracts";

import {
  buildAssistantProcessTimelineEntries,
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

function formatTimeRange(startAt: string, completedAt: string | null) {
  if (!completedAt || completedAt === startAt) {
    return formatTime(startAt);
  }

  const startLabel = formatTime(startAt);
  const completedLabel = formatTime(completedAt);

  return startLabel === completedLabel ? completedLabel : `${startLabel} → ${completedLabel}`;
}

function getTimelineTone(status: MessageStatus) {
  if (status === MESSAGE_STATUS.FAILED) {
    return "border-red-200/80 bg-red-50/70 text-red-700";
  }

  if (status === MESSAGE_STATUS.STREAMING) {
    return "border-amber-200/80 bg-amber-50/70 text-amber-800";
  }

  return "border-emerald-200/80 bg-emerald-50/70 text-emerald-800";
}

function describeEntryStatus(status: MessageStatus) {
  return status === MESSAGE_STATUS.STREAMING
    ? "进行中"
    : status === MESSAGE_STATUS.FAILED
      ? "失败"
      : "完成";
}

function describeEntryHeadline(input: {
  toolName: string | null;
  status: MessageStatus;
  error: string | null;
  contentMarkdown: string;
}) {
  if (!input.toolName) {
    return input.contentMarkdown;
  }

  if (input.status === MESSAGE_STATUS.STREAMING) {
    return "正在等待工具结果";
  }

  if (input.status === MESSAGE_STATUS.FAILED) {
    return input.error ?? "调用失败";
  }

  return "已收到工具结果";
}

function formatPayloadValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function describePayloadPreview(value: unknown) {
  if (value == null) {
    return "空";
  }

  if (Array.isArray(value)) {
    return `${value.length} 项`;
  }

  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);

    if (keys.length === 0) {
      return "对象";
    }

    return keys.length <= 2 ? keys.join("、") : `${keys.slice(0, 2).join("、")} 等 ${keys.length} 项`;
  }

  if (typeof value === "string") {
    const normalized = value.trim();

    if (!normalized) {
      return "字符串";
    }

    return normalized.length > 36 ? `${normalized.slice(0, 36)}...` : normalized;
  }

  return String(value);
}

function ToolPayloadDisclosure({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  return (
    <details className="group/payload rounded-[18px] border border-app-border/65 bg-white/78 px-3.5 py-2.5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[12px] text-app-muted-strong">
        <span className="inline-flex items-center gap-2 font-medium text-app-text">
          <span className="text-sm leading-none transition group-open/payload:rotate-90">›</span>
          {label}
        </span>
        <span className="truncate text-app-muted">{describePayloadPreview(value)}</span>
      </summary>

      <div className="mt-2 border-t border-app-border/60 pt-2">
        <pre className="max-h-[280px] overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-app-surface-soft px-3 py-2.5 text-[12px] leading-6 text-app-muted-strong">
          {formatPayloadValue(value)}
        </pre>
      </div>
    </details>
  );
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
  const timelineEntries = buildAssistantProcessTimelineEntries(timelineMessages);

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  const summary = describeAssistantProcessSummary({
    stepCount: timelineEntries.length,
    isStreaming: defaultOpen,
    runtimeStatus,
  });

  if (
    !canShowAssistantProcess({
      stepCount: timelineEntries.length,
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
      <summary className="flex cursor-pointer list-none items-center gap-3 text-sm text-app-muted-strong">
        <span className="inline-flex items-center gap-2 font-medium text-app-text">
          <span className="text-base leading-none transition group-open:rotate-90">›</span>
          {summary}
        </span>
      </summary>

      {timelineEntries.length > 0 ? (
        <div className="mt-3 grid gap-3 border-t border-app-border/55 pt-3">
          {timelineEntries.map((entry) => (
            <article
              key={entry.id}
              className="grid gap-3 rounded-[20px] border border-app-border/60 bg-app-surface-soft/72 px-4 py-3.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium",
                        getTimelineTone(entry.status),
                      )}
                    >
                      {describeEntryStatus(entry.status)}
                    </span>
                    {entry.toolName ? (
                      <span className={ui.codeChip}>{entry.toolName}</span>
                    ) : null}
                  </div>
                  <p className="text-[13px] leading-6 text-app-muted-strong">
                    {describeEntryHeadline({
                      toolName: entry.toolName,
                      status: entry.status,
                      error: entry.error,
                      contentMarkdown: entry.contentMarkdown,
                    })}
                  </p>
                </div>
                <span className="text-[12px] text-app-muted">
                  {formatTimeRange(entry.createdAt, entry.completedAt)}
                </span>
              </div>

              {entry.kind === "tool_call" && (entry.input !== null || entry.output !== null) ? (
                <div className="grid gap-2 border-t border-app-border/55 pt-3">
                  {entry.input !== null ? (
                    <ToolPayloadDisclosure label="入参" value={entry.input} />
                  ) : null}
                  {entry.output !== null ? (
                    <ToolPayloadDisclosure label="结果" value={entry.output} />
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {timelineEntries.length === 0 && runtimeStatus ? (
        <p className={cn(ui.muted, "mt-3 border-t border-app-border/55 pt-3 text-[13px]")}>
          {runtimeStatus}
        </p>
      ) : null}
    </details>
  );
}
