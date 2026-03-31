"use client";

import { createElement } from "react";
import { XMarkdown, type ComponentProps as XMarkdownComponentProps } from "@ant-design/x-markdown/es";

import { type CitationPreviewModel } from "@/lib/citation-display";
import { cn, textSelectionStyles } from "@/lib/ui";

export function CitationPreviewExcerpt({
  preview,
  className,
}: {
  preview: CitationPreviewModel;
  className?: string;
}) {
  if (!preview.excerpt) {
    return null;
  }

  if (preview.excerptFormat === "markdown") {
    return createElement(XMarkdown, {
      content: preview.excerpt,
      className: cn(
        "x-markdown-light app-markdown citation-preview-markdown max-h-[9.5rem] overflow-hidden [mask-image:linear-gradient(180deg,#000_0%,#000_82%,transparent_100%)] text-[13px] leading-6 text-app-muted-strong",
        textSelectionStyles.content,
        className,
      ),
      components: {
        a: ({ children }: XMarkdownComponentProps) => (
          <span className="font-medium text-app-text underline decoration-app-border-strong/80 underline-offset-[0.18em]">
            {children}
          </span>
        ),
        img: ({ alt }: XMarkdownComponentProps) =>
          typeof alt === "string" && alt.trim() ? (
            <span className="text-[12px] italic text-app-muted-strong">{alt}</span>
          ) : null,
      },
    });
  }

  return (
    <span
      className={cn(
        textSelectionStyles.content,
        "line-clamp-4 text-[13px] leading-6 text-app-muted-strong",
        className,
      )}
    >
      {preview.excerpt}
    </span>
  );
}
