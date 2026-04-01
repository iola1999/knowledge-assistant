"use client";

import { useEffect, useState } from "react";

import { MESSAGE_STATUS, type MessageStatus } from "@anchordesk/contracts";

import {
  AnswerIcon,
  ChevronDownIcon,
  GlobeIcon,
  LibraryIcon,
  SlidersIcon,
  SourceIcon,
} from "@/components/icons";
import {
  buildAssistantProcessTimelineEntries,
  canShowAssistantProcess,
  describeAssistantProcessSummary,
} from "@/lib/api/conversation-process";
import { conversationDensityClassNames } from "@/lib/conversation-density";
import {
  buildConversationTimelineEntryView,
  canExpandConversationTimelineEntry,
  type ConversationTimelinePreviewItem,
  type ConversationTimelineEntryView,
} from "@/lib/conversation-timeline";
import { cn } from "@/lib/ui";

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
    return keys.length <= 2 ? keys.join("、") || "对象" : `${keys.slice(0, 2).join("、")} 等 ${keys.length} 项`;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return "字符串";
    }

    return normalized.length > 28 ? `${normalized.slice(0, 28)}...` : normalized;
  }

  return String(value);
}

function resolveTimelineIcon(entry: ConversationTimelineEntryView) {
  switch (entry.icon) {
    case "knowledge":
    case "attachment":
      return <LibraryIcon className="size-3.5" />;
    case "web":
      return <GlobeIcon className="size-3.5" />;
    case "fetch":
      return <SourceIcon className="size-3.5" />;
    case "thinking":
    case "report":
      return <AnswerIcon className="size-3.5" />;
    default:
      return <SlidersIcon className="size-3.5" />;
  }
}

function resolveMarkerClasses(entry: ConversationTimelineEntryView) {
  return entry.tone === "danger"
    ? "border-red-200/90 bg-red-50 text-red-700"
    : entry.tone === "active"
      ? "border-amber-200/90 bg-amber-50 text-amber-800"
      : entry.tone === "success"
        ? "border-emerald-200/80 bg-white text-emerald-800"
        : "border-app-border/70 bg-app-bg text-app-muted-strong";
}

function resolveStatusClasses(entry: ConversationTimelineEntryView) {
  return entry.tone === "danger"
    ? "border-red-200/80 bg-red-50/88 text-red-700"
    : entry.tone === "active"
      ? "border-amber-200/80 bg-amber-50/88 text-amber-800"
      : entry.tone === "success"
        ? "border-emerald-200/80 bg-emerald-50/88 text-emerald-800"
        : "border-app-border/70 bg-white/82 text-app-muted-strong";
}

function ToolPayloadBlock({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  return (
    <details className="rounded-[14px] border border-app-border/65 bg-app-surface-soft/66 px-2.5 py-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[11px] text-app-muted-strong [&::-webkit-details-marker]:hidden">
        <span className="font-medium text-app-text">{label}</span>
        <span className="min-w-0 truncate">{describePayloadPreview(value)}</span>
      </summary>

      <pre className="mt-2 max-h-[220px] overflow-auto rounded-[12px] border border-app-border/55 bg-white/78 px-2.5 py-2 text-[11px] leading-5 text-app-muted-strong">
        {formatPayloadValue(value)}
      </pre>
    </details>
  );
}

function TimelinePreviewList({
  items,
  limit,
}: {
  items: ConversationTimelinePreviewItem[];
  limit?: number;
}) {
  const visibleItems = typeof limit === "number" ? items.slice(0, limit) : items;
  const hiddenCount = typeof limit === "number" ? Math.max(items.length - limit, 0) : 0;

  if (visibleItems.length === 0 && hiddenCount === 0) {
    return null;
  }

  return (
    <div className="grid gap-1.5">
      {visibleItems.map((item, index) => {
        const content = (
          <span
            className={cn(
              "group flex min-w-0 items-center gap-2 rounded-[13px] border border-app-border/65 bg-white/82 px-2.5 py-1.5 text-left",
              item.href ? "hover:border-app-border-strong hover:bg-white" : "",
            )}
          >
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-app-muted">
              {item.label}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[11.5px] leading-4.5 text-app-text",
                item.href ? "group-hover:underline" : "",
              )}
            >
              {item.value}
            </span>
            {item.meta ? (
              <span className="shrink-0 text-[10px] leading-4 text-app-muted">
                {item.meta}
              </span>
            ) : null}
          </span>
        );

        return item.href ? (
          <a
            key={`${item.label}-${index}`}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {content}
          </a>
        ) : (
          <div key={`${item.label}-${index}`}>{content}</div>
        );
      })}

      {hiddenCount > 0 ? (
        <div className="rounded-[13px] border border-dashed border-app-border/70 bg-white/70 px-2.5 py-1.5 text-[11px] text-app-muted-strong">
          另外还有 {hiddenCount} 项
        </div>
      ) : null}
    </div>
  );
}

function TimelineEntry({
  entry,
  defaultOpen = false,
}: {
  entry: ConversationTimelineEntryView;
  defaultOpen?: boolean;
}) {
  const expandable = canExpandConversationTimelineEntry(entry);
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen, entry.id]);

  const summary = (
    <span className="grid min-w-0 grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-2.5">
      <span className="relative z-10 flex justify-center pt-1">
        <span
          className={cn(
            "inline-flex size-[18px] items-center justify-center rounded-full border",
            resolveMarkerClasses(entry),
          )}
        >
          {resolveTimelineIcon(entry)}
        </span>
      </span>

      <span className="min-w-0">
        <span className="flex min-w-0 items-start gap-2">
          <span className="min-w-0 flex-1 truncate text-[12.5px] leading-5 text-app-text">
            {entry.displayName}
          </span>
        </span>

        {entry.arguments.length > 0 ? (
          <span className="mt-1 flex flex-wrap gap-1">
            {entry.arguments.map((item) => (
              <span
                key={`${item.label}-${item.value}`}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-app-border/70 bg-white/82 px-2 py-0.5 text-[10px] text-app-muted-strong"
              >
                <span className="shrink-0 text-app-muted">{item.label}</span>
                <span className="min-w-0 truncate text-app-text">{item.value}</span>
              </span>
            ))}
          </span>
        ) : null}

        {entry.previewSummary && !open ? (
          <span className="mt-1 block text-[11px] leading-4.5 text-app-muted-strong">
            {entry.previewSummary}
          </span>
        ) : null}
      </span>

      <span className="flex items-start gap-1.5 pt-0.5">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold",
            resolveStatusClasses(entry),
          )}
        >
          {entry.statusLabel}
        </span>
        {expandable ? (
          <span
            className={cn(
              "text-app-muted transition-transform",
              open ? "rotate-180" : "rotate-0",
            )}
          >
            <ChevronDownIcon className="size-3.5" />
          </span>
        ) : null}
      </span>
    </span>
  );

  const details = (
    <div className="ml-[28px] mt-1.5 grid gap-2.5">
      {entry.kind === "thinking" && entry.detailText ? (
        <div className="rounded-[14px] border border-app-border/65 bg-white/78 px-3 py-2.5">
          <pre className="whitespace-pre-wrap break-words text-[11.5px] leading-5 text-app-muted-strong">
            {entry.detailText}
          </pre>
        </div>
      ) : null}

      {entry.previewSummary && entry.kind !== "thinking" ? (
        <p className="text-[11px] leading-4.5 text-app-muted-strong">{entry.previewSummary}</p>
      ) : null}

      {entry.previewItems.length > 0 ? <TimelinePreviewList items={entry.previewItems} /> : null}

      {entry.input !== null ? <ToolPayloadBlock label="原始入参" value={entry.input} /> : null}
      {entry.output !== null ? <ToolPayloadBlock label="原始结果" value={entry.output} /> : null}

      <p className="text-[10px] leading-4 text-app-muted">
        {formatTimeRange(entry.createdAt, entry.completedAt)}
      </p>
    </div>
  );

  if (!expandable) {
    return (
      <article className={conversationDensityClassNames.timelineEntry}>
        {summary}
      </article>
    );
  }

  return (
    <article className={conversationDensityClassNames.timelineEntry}>
      <button
        type="button"
        className="w-full cursor-pointer text-left"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        {summary}
      </button>
      {open ? details : null}
    </article>
  );
}

export function ConversationTimeline({
  assistantContentMarkdown,
  assistantStatus,
  assistantStructuredJson,
  timelineMessages,
  runtimeStatus,
  defaultOpen = false,
}: {
  assistantContentMarkdown: string;
  assistantStatus: MessageStatus;
  assistantStructuredJson?: Record<string, unknown> | null;
  timelineMessages: TimelineMessage[];
  runtimeStatus?: string | null;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const timelineEntries = buildAssistantProcessTimelineEntries({
    assistantContentMarkdown,
    assistantStatus,
    assistantStructuredJson,
    timelineMessages,
  }).map(buildConversationTimelineEntryView);

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
    <div className={conversationDensityClassNames.timelineShell}>
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-1.5 text-[12px] font-medium text-app-muted-strong"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <ChevronDownIcon
          className={cn("size-3.5 transition-transform", open ? "rotate-180" : "rotate-0")}
        />
        <span className="text-app-text">{summary}</span>
      </button>

      {open && timelineEntries.length > 0 ? (
        <div className={conversationDensityClassNames.timelineList}>
          {timelineEntries.map((entry, index) => (
            <TimelineEntry
              key={entry.id}
              entry={entry}
              defaultOpen={
                defaultOpen &&
                entry.status === MESSAGE_STATUS.STREAMING &&
                index === timelineEntries.length - 1
              }
            />
          ))}
        </div>
      ) : null}

      {open && timelineEntries.length === 0 && runtimeStatus ? (
        <p className="mt-2 border-t border-app-border/55 pt-2 text-[11px] leading-4.5 text-app-muted-strong">
          {runtimeStatus}
        </p>
      ) : null}
    </div>
  );
}
