"use client";

import { createElement } from "react";
import { XMarkdown, type ComponentProps as XMarkdownComponentProps } from "@ant-design/x-markdown/es";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/shared/hover-card";
import { GlobeIcon, SourceIcon } from "@/components/icons";
import { CitationPreviewExcerpt } from "@/components/shared/citation-preview-excerpt";
import { KnowledgeSourceBadge } from "@/components/shared/knowledge-source-badge";
import { type ConversationMessageCitation } from "@/lib/api/conversation-session";
import {
  buildCitationBadgeSummary,
  buildCitationLinkTarget,
  buildCitationPreviewModel,
} from "@/lib/citation-display";
import {
  parseInlineCitationIndices,
  renderInlineCitationMarkers,
} from "@/lib/inline-citations";

import { cn, textSelectionStyles } from "../../lib/ui";

function InlineCitationPreviewEntry({
  citation,
  sourceLinksEnabled,
  workspaceId,
}: {
  citation: ConversationMessageCitation;
  sourceLinksEnabled: boolean;
  workspaceId?: string | null;
}) {
  const target = buildCitationLinkTarget({
    citation,
    sourceLinksEnabled,
    workspaceId,
  });
  const preview = buildCitationPreviewModel(citation);
  const body = (
    <span
      className={cn(
        textSelectionStyles.content,
        "grid gap-2 rounded-xl px-3 py-2.5 text-left transition",
        target ? "hover:bg-app-surface-soft/82" : "",
      )}
    >
      <span className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-full border",
            preview.isWeb
              ? "border-app-border bg-app-surface-soft text-app-muted-strong"
              : "border-app-border bg-white text-app-muted-strong",
          )}
        >
          {preview.isWeb ? (
            <GlobeIcon className="size-3.5" />
          ) : (
            <SourceIcon className="size-3.5" />
          )}
        </span>

        {preview.isWeb ? (
          <span className="min-w-0 truncate text-[12px] font-medium text-app-muted-strong">
            {preview.meta ?? preview.badgeLabel}
          </span>
        ) : (
          <KnowledgeSourceBadge
            sourceScope={citation.sourceScope}
            libraryTitle={citation.libraryTitle}
          />
        )}
      </span>

      <span className="text-[15px] font-semibold leading-6 text-app-text">
        {preview.title}
      </span>

      <CitationPreviewExcerpt preview={preview} />
    </span>
  );

  if (target) {
    return (
      <a
        href={target.href}
        target="_blank"
        rel="noopener noreferrer"
        className="block no-underline"
      >
        {body}
      </a>
    );
  }

  return body;
}

function InlineCitationGroup({
  citations,
}: {
  citations: ConversationMessageCitation[];
}) {
  const summary = buildCitationBadgeSummary(citations);

  return (
    <span
      className={cn(
        "mx-0.5 inline-flex max-w-[14rem] items-center gap-1 rounded-full border border-app-border bg-white/92 px-2 py-1 align-super text-[11px] font-medium leading-none text-app-muted-strong shadow-soft transition hover:border-app-border-strong hover:bg-white hover:text-app-text",
      )}
      title={summary.label}
    >
      <span className="truncate">{summary.label}</span>
      {summary.extraCount > 0 ? (
        <span className="rounded-full bg-app-surface-soft px-1.5 py-[1px] text-[10px] text-app-muted">
          +{summary.extraCount}
        </span>
      ) : null}
    </span>
  );
}

function InlineCitationMarker({
  citations,
  indices,
  sourceLinksEnabled,
  workspaceId,
}: {
  citations: ConversationMessageCitation[];
  indices: number[];
  sourceLinksEnabled: boolean;
  workspaceId?: string | null;
}) {
  if (citations.length === 0) {
    return (
      <sup className="mx-0.5 inline-flex align-super text-[10px] font-semibold text-app-muted">
        [{indices[0] ?? 0}]
      </sup>
    );
  }

  return (
    <HoverCard placement="bottom" sideOffset={10} collisionPadding={12} maxHeight={320}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="inline-flex appearance-none border-0 bg-transparent p-0 align-baseline"
          aria-haspopup="dialog"
        >
          <InlineCitationGroup citations={citations} />
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="z-30 grid w-[min(360px,calc(100vw-24px))] grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden p-1.5 text-left">
        <span className="flex items-center justify-between px-3 pt-2.5 pb-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-app-accent">
            来源
          </span>
          <span className="text-[12px] text-app-muted">{citations.length} 个来源</span>
        </span>
        <span className="mx-2 my-1.5 block h-px bg-app-border/70" />
        <span className="block min-h-0 overflow-y-auto">
          {citations.map((citation, position) => (
            <span key={citation.id} className="block">
              <InlineCitationPreviewEntry
                citation={citation}
                sourceLinksEnabled={sourceLinksEnabled}
                workspaceId={workspaceId}
              />
              {position < citations.length - 1 ? (
                <span className="mx-3 block h-px bg-app-border/60" />
              ) : null}
            </span>
          ))}
        </span>
      </HoverCardContent>
    </HoverCard>
  );
}

export function MarkdownContent({
  content,
  className,
  streaming = false,
  citations = [],
  workspaceId,
  sourceLinksEnabled = true,
}: {
  content: string;
  className?: string;
  streaming?: boolean;
  citations?: ConversationMessageCitation[];
  workspaceId?: string | null;
  sourceLinksEnabled?: boolean;
}) {
  const renderedContent = renderInlineCitationMarkers(content);
  return createElement(XMarkdown, {
    content: renderedContent,
    className: cn("x-markdown-light app-markdown", textSelectionStyles.content, className),
    openLinksInNewTab: true,
    dompurifyConfig: {
      ADD_TAGS: ["citation-group"],
      ADD_ATTR: ["data-citation-indices"],
    },
    components: {
      "citation-group": (props: XMarkdownComponentProps) => {
        const rawIndices =
          typeof props["data-citation-indices"] === "string"
            ? props["data-citation-indices"]
            : props.domNode &&
                "attribs" in props.domNode &&
                typeof props.domNode.attribs?.["data-citation-indices"] === "string"
              ? props.domNode.attribs["data-citation-indices"]
              : "";
        const indices = parseInlineCitationIndices(rawIndices);

        return (
          <InlineCitationMarker
            citations={indices.map((index) => citations[index - 1]).filter(Boolean)}
            indices={indices}
            sourceLinksEnabled={sourceLinksEnabled}
            workspaceId={workspaceId}
          />
        );
      },
    },
    streaming: streaming
      ? {
          hasNextChunk: true,
          tail: {
            content: "▍",
          },
        }
      : undefined,
  });
}
