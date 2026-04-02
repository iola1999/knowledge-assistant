"use client";

import { useEffect, useState } from "react";

import { MESSAGE_STATUS, type MessageStatus } from "@anchordesk/contracts";

import {
  AnswerIcon,
  BoltIcon,
  ChevronDownIcon,
  GlobeIcon,
  LibraryIcon,
  SearchIcon,
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
      return <BoltIcon className="size-3.5" />;
    default:
      return <SlidersIcon className="size-3.5" />;
  }
}

function resolveMarkerClasses(entry: ConversationTimelineEntryView) {
  return entry.tone === "danger"
    ? "text-red-700"
    : entry.tone === "active"
      ? "text-app-text"
      : "text-app-muted-strong";
}

function resolveStatusTextClasses(entry: ConversationTimelineEntryView) {
  return entry.tone === "danger"
    ? "text-red-600"
    : entry.tone === "active"
      ? "text-app-muted-strong"
      : "text-app-muted";
}

function resolvePreviewTextClasses(tone: ConversationTimelinePreviewItem["tone"]) {
  return tone === "danger"
    ? {
        value: "text-red-700",
        meta: "text-red-600/85",
      }
    : tone === "warning"
      ? {
          value: "text-amber-900",
          meta: "text-amber-700/85",
        }
      : {
          value: "text-app-text",
          meta: "text-app-muted",
        };
}

function formatArgumentText(label: string, value: string) {
  if (label === "关键词" || label === "链接" || label === "页段") {
    return value;
  }

  return `${label} · ${value}`;
}

function buildFaviconUrl(href: string | null | undefined) {
  if (!href) {
    return null;
  }

  try {
    return `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(href)}`;
  } catch {
    return null;
  }
}

function ToolPayloadBlock({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-w-0">
      <button
        type="button"
        className={cn(conversationDensityClassNames.payloadDisclosure, open && "text-app-text")}
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <span className="font-medium">{label}</span>
        <ChevronDownIcon
          className={cn("size-3 shrink-0 text-app-muted transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <pre className={cn("mt-1.5", conversationDensityClassNames.payloadPre)}>
          {formatPayloadValue(value)}
        </pre>
      ) : null}
    </div>
  );
}

function TimelinePreviewList({
  items,
  limit,
}: {
  items: ConversationTimelinePreviewItem[];
  limit?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const visibleItems =
    showAll || typeof limit !== "number" ? items : items.slice(0, limit);
  const hiddenCount =
    typeof limit === "number" && !showAll ? Math.max(items.length - limit, 0) : 0;
  const canToggle = typeof limit === "number" && items.length > limit;

  if (visibleItems.length === 0 && hiddenCount === 0) {
    return null;
  }

  return (
    <div className={conversationDensityClassNames.timelinePreviewList}>
      {visibleItems.map((item, index) => {
        const toneClasses = resolvePreviewTextClasses(item.tone);
        const faviconUrl = buildFaviconUrl(item.href);
        const content = (
          <span
            className={cn(
              conversationDensityClassNames.timelinePreviewItem,
              item.href ? "group hover:text-app-text" : "",
            )}
          >
            <span className="relative flex size-[14px] shrink-0 items-center justify-center overflow-hidden rounded-full">
              {item.href && faviconUrl ? (
                <img
                  alt=""
                  aria-hidden="true"
                  className="block size-[14px]"
                  height="14"
                  src={faviconUrl}
                  width="14"
                />
              ) : item.href ? (
                <GlobeIcon className="size-3.5 text-app-muted" />
              ) : item.label === "摘录" || item.label === "引用" || item.label === "草稿" ? (
                <AnswerIcon className="size-3.5 text-app-muted" />
              ) : (
                <SearchIcon className="size-3.5 text-app-muted" />
              )}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[11px] leading-5",
                toneClasses.value,
                item.href ? "group-hover:underline" : "",
              )}
            >
              {item.value}
            </span>
            {item.meta ? (
              <span
                className={cn(
                  "shrink-0 truncate text-[10.5px] leading-4",
                  toneClasses.meta,
                )}
              >
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

      {canToggle ? (
        <button
          type="button"
          className="w-fit px-0 text-[10.5px] font-medium text-app-muted transition hover:text-app-text"
          onClick={() => {
            setShowAll((current) => !current);
          }}
        >
          {showAll ? "收起" : `+其他 ${hiddenCount} 个`}
        </button>
      ) : null}
    </div>
  );
}

function TimelineEntry({
  entry,
  defaultOpen = false,
  isLast = false,
}: {
  entry: ConversationTimelineEntryView;
  defaultOpen?: boolean;
  isLast?: boolean;
}) {
  const expandable = canExpandConversationTimelineEntry(entry);
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen, entry.id]);

  const statusLabel =
    entry.status === MESSAGE_STATUS.COMPLETED && entry.kind !== "status_event"
      ? null
      : entry.statusLabel;

  const summary = (
    <span className="flex min-w-0 max-w-full items-start gap-2">
      <span className="relative z-10 flex size-5 shrink-0 items-center justify-center">
        <span className="absolute inset-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-app-bg" />
        <span className={cn("relative", resolveMarkerClasses(entry))}>
          {resolveTimelineIcon(entry)}
        </span>
      </span>

      <span className="flex min-w-0 max-w-full items-start gap-1.5">
        <span className="min-w-0 truncate text-[12px] leading-5 text-inherit">
          {entry.displayName}
        </span>
        {statusLabel ? (
          <span
            className={cn(
              "shrink-0 pt-[2px] text-[10.5px] leading-4",
              resolveStatusTextClasses(entry),
            )}
          >
            {statusLabel}
          </span>
        ) : null}
        {expandable ? (
          <span
            className={cn(
              "shrink-0 pt-[2px] text-app-muted transition-transform",
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
    <div className="ml-[28px] mt-2 grid min-w-0 max-w-full gap-2 overflow-hidden pl-[14px]">
      {entry.arguments.length > 0 ? (
        <div className="grid gap-1.5">
          {entry.arguments.map((item) => (
            <div
              key={`${item.label}-${item.value}`}
              className={conversationDensityClassNames.timelineArgument}
            >
              <SearchIcon className="size-3.5 shrink-0 text-app-muted" />
              <span className="min-w-0 truncate">
                {formatArgumentText(item.label, item.value)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {entry.kind === "thinking" && entry.detailText ? (
        <div className="min-w-0 max-w-full overflow-hidden">
          <pre className="whitespace-pre-wrap break-words text-[11.5px] leading-5 text-app-muted-strong">
            {entry.detailText}
          </pre>
        </div>
      ) : null}

      {entry.previewSummary && entry.kind !== "thinking" && entry.previewItems.length === 0 ? (
        <p className="text-[10.5px] leading-4.5 text-app-muted-strong">{entry.previewSummary}</p>
      ) : null}

      {entry.previewItems.length > 0 ? (
        <TimelinePreviewList items={entry.previewItems} limit={3} />
      ) : null}

      {entry.input !== null || entry.output !== null ? (
        <div className="grid gap-1">
          {entry.input !== null ? <ToolPayloadBlock label="原始入参" value={entry.input} /> : null}
          {entry.output !== null ? <ToolPayloadBlock label="原始结果" value={entry.output} /> : null}
        </div>
      ) : null}
    </div>
  );

  if (!expandable) {
    return (
      <article className={conversationDensityClassNames.timelineEntry}>
        {!isLast ? (
          <span className="absolute left-[9px] top-[18px] bottom-[-18px] w-px bg-app-border/75" />
        ) : null}
        {summary}
      </article>
    );
  }

  return (
    <article className={conversationDensityClassNames.timelineEntry}>
      {!isLast ? (
        <span className="absolute left-[9px] top-[18px] bottom-[-18px] w-px bg-app-border/75" />
      ) : null}
      <button
        type="button"
        className="max-w-full cursor-pointer text-left text-app-muted-strong transition hover:text-app-text"
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
        className="flex w-fit max-w-full cursor-pointer items-center gap-1.5 text-[12px] font-semibold text-app-muted-strong transition hover:text-app-text"
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
              isLast={index === timelineEntries.length - 1}
              defaultOpen={
                defaultOpen &&
                entry.status === MESSAGE_STATUS.STREAMING &&
                index === timelineEntries.length - 1
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
