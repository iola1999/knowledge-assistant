"use client";

import { createElement } from "react";
import { XMarkdown, type ComponentProps as XMarkdownComponentProps } from "@ant-design/x-markdown/es";

import { KnowledgeSourceBadge } from "@/components/shared/knowledge-source-badge";
import { type ConversationMessageCitation } from "@/lib/api/conversation-session";
import { renderInlineCitationMarkers } from "@/lib/inline-citations";

import { cn, textSelectionStyles } from "../../lib/ui";

function resolveCitationTarget(input: {
  citation: ConversationMessageCitation;
  sourceLinksEnabled: boolean;
  workspaceId?: string | null;
}) {
  if (!input.sourceLinksEnabled) {
    return null;
  }

  if (input.workspaceId && input.citation.documentId && input.citation.anchorId) {
    return {
      href: `/workspaces/${input.workspaceId}/documents/${input.citation.documentId}?anchorId=${input.citation.anchorId}`,
      external: false,
    };
  }

  if (input.citation.sourceUrl) {
    return {
      href: input.citation.sourceUrl,
      external: true,
    };
  }

  return null;
}

function InlineCitationMarker({
  citation,
  index,
  sourceLinksEnabled,
  workspaceId,
}: {
  citation: ConversationMessageCitation | null;
  index: number;
  sourceLinksEnabled: boolean;
  workspaceId?: string | null;
}) {
  if (!citation) {
    return (
      <sup className="mx-0.5 inline-flex align-super text-[10px] font-semibold text-app-muted">
        [{index}]
      </sup>
    );
  }

  const target = resolveCitationTarget({
    citation,
    sourceLinksEnabled,
    workspaceId,
  });
  const marker = (
    <span
      className={cn(
        "mx-0.5 inline-flex min-w-5 items-center justify-center rounded-full border border-app-border bg-app-surface-strong/78 px-1.5 py-0.5 align-super text-[10px] font-semibold leading-none text-app-muted-strong transition hover:border-app-border-strong hover:text-app-text",
        target ? "cursor-pointer" : "cursor-default",
      )}
    >
      {index}
    </span>
  );
  const previewCard = (
    <span
      className={cn(
        "pointer-events-none absolute left-1/2 top-[calc(100%+8px)] z-20 hidden w-[min(320px,calc(100vw-32px))] -translate-x-1/2 rounded-2xl border border-app-border bg-white/98 p-3 text-left shadow-card backdrop-blur-md group-hover:block group-focus-within:block",
      )}
    >
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.12em] text-app-muted">
          资料 {index}
        </span>
        <KnowledgeSourceBadge
          sourceScope={citation.sourceScope}
          libraryTitle={citation.libraryTitle}
        />
      </span>
      <span className="mt-2 block text-[13px] leading-5 text-app-text">{citation.label}</span>
      {citation.sourceUrl ? (
        <span className="mt-1 block truncate text-[11px] text-app-accent">
          {citation.sourceUrl}
        </span>
      ) : null}
      {citation.quoteText.trim() ? (
        <span className="mt-2 block text-[12px] leading-5 text-app-muted-strong">
          {citation.quoteText}
        </span>
      ) : null}
    </span>
  );

  if (target) {
    return (
      <a
        href={target.href}
        target={target.external ? "_blank" : undefined}
        rel={target.external ? "noreferrer" : undefined}
        className="group relative inline-flex no-underline"
      >
        {marker}
        {previewCard}
      </a>
    );
  }

  return (
    <span className="group relative inline-flex" tabIndex={0}>
      {marker}
      {previewCard}
    </span>
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
      ADD_TAGS: ["citation-marker"],
      ADD_ATTR: ["data-citation-index"],
    },
    components: {
      "citation-marker": (props: XMarkdownComponentProps) => {
        const rawIndex =
          typeof props["data-citation-index"] === "string"
            ? props["data-citation-index"]
            : props.domNode &&
                "attribs" in props.domNode &&
                typeof props.domNode.attribs?.["data-citation-index"] === "string"
              ? props.domNode.attribs["data-citation-index"]
              : "";
        const index = Number(rawIndex);

        return (
          <InlineCitationMarker
            citation={
              Number.isInteger(index) && index > 0 ? citations[index - 1] ?? null : null
            }
            index={Number.isInteger(index) && index > 0 ? index : 0}
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
