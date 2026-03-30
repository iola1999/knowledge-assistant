"use client";

import { useEffect, useState } from "react";

import { MESSAGE_STATUS, type MessageStatus } from "@anchordesk/contracts";

import {
  buildAssistantProcessTimelineEntries,
  canShowAssistantProcess,
  describeAssistantProcessSummary,
} from "@/lib/api/conversation-process";
import { conversationDensityClassNames } from "@/lib/conversation-density";
import {
  canExpandConversationTimelineEntry,
  describeConversationTimelineEntryDetailsLabel,
} from "@/lib/conversation-timeline";
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

function ToolPayloadBlock({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  return (
    <div className={conversationDensityClassNames.payloadDisclosure}>
      <div className="flex items-center justify-between gap-3 text-[11px] text-app-muted-strong">
        <span className="font-medium text-app-text">{label}</span>
        <span className="min-w-0 flex-1 truncate text-right text-app-muted">
          {describePayloadPreview(value)}
        </span>
      </div>

      <div className="mt-2 border-t border-app-border/60 pt-2">
        <pre className={conversationDensityClassNames.payloadPre}>
          {formatPayloadValue(value)}
        </pre>
      </div>
    </div>
  );
}

function TimelineEntrySummary({
  entry,
  expandable = false,
}: {
  entry: ReturnType<typeof buildAssistantProcessTimelineEntries>[number];
  expandable?: boolean;
}) {
  return (
    <div className={conversationDensityClassNames.timelineEntrySummary}>
      <div className="grid min-w-0 gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {expandable ? (
            <span className="text-sm leading-none text-app-muted transition group-open/timeline-entry:rotate-90">
              ›
            </span>
          ) : null}
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
              getTimelineTone(entry.status),
            )}
          >
            {describeEntryStatus(entry.status)}
          </span>
          {entry.toolName ? <span className={ui.codeChip}>{entry.toolName}</span> : null}
        </div>
        <p className="text-[12px] leading-5 text-app-muted-strong [overflow-wrap:anywhere]">
          {describeEntryHeadline({
            toolName: entry.toolName,
            status: entry.status,
            error: entry.error,
            contentMarkdown: entry.contentMarkdown,
          })}
        </p>
        {expandable ? (
          <span className={conversationDensityClassNames.timelineEntryMeta}>
            {describeConversationTimelineEntryDetailsLabel(entry)}
          </span>
        ) : null}
      </div>
      <span className="shrink-0 pt-0.5 text-[11px] text-app-muted">
        {formatTimeRange(entry.createdAt, entry.completedAt)}
      </span>
    </div>
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
      className={conversationDensityClassNames.timelineShell}
      open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2.5 text-[13px] text-app-muted-strong">
        <span className="inline-flex items-center gap-2 font-medium text-app-text">
          <span className="text-sm leading-none transition group-open:rotate-90">›</span>
          {summary}
        </span>
      </summary>

      {timelineEntries.length > 0 ? (
        <div className={conversationDensityClassNames.timelineList}>
          {timelineEntries.map((entry) => {
            const expandable = canExpandConversationTimelineEntry(entry);

            if (!expandable) {
              return (
                <article key={entry.id} className={conversationDensityClassNames.timelineEntry}>
                  <TimelineEntrySummary entry={entry} />
                </article>
              );
            }

            return (
              <details
                key={entry.id}
                className={cn(
                  conversationDensityClassNames.timelineEntry,
                  "group/timeline-entry rounded-r-lg",
                )}
              >
                <summary className="list-none cursor-pointer [&::-webkit-details-marker]:hidden">
                  <TimelineEntrySummary entry={entry} expandable />
                </summary>

                <div className={conversationDensityClassNames.timelineEntryDetails}>
                  {entry.input !== null ? (
                    <ToolPayloadBlock label="入参" value={entry.input} />
                  ) : null}
                  {entry.output !== null ? (
                    <ToolPayloadBlock label="结果" value={entry.output} />
                  ) : null}
                </div>
              </details>
            );
          })}
        </div>
      ) : null}

      {timelineEntries.length === 0 && runtimeStatus ? (
        <p className={cn(ui.muted, "mt-2 border-t border-app-border/55 pt-2.5 text-[12px]")}>
          {runtimeStatus}
        </p>
      ) : null}
    </details>
  );
}
