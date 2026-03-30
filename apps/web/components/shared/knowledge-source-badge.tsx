"use client";

import { type KnowledgeSourceScope } from "@anchordesk/contracts";

import { buildKnowledgeSourceBadge } from "@/lib/api/knowledge-libraries";
import { cn } from "@/lib/ui";

export function KnowledgeSourceBadge({
  sourceScope,
  libraryTitle,
  className,
}: {
  sourceScope: KnowledgeSourceScope | null | undefined;
  libraryTitle: string | null | undefined;
  className?: string;
}) {
  const badge = buildKnowledgeSourceBadge({
    sourceScope,
    libraryTitle,
  });

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px]",
        badge.tone === "global"
          ? "border-app-border bg-app-surface-soft text-app-text"
          : "border-app-border bg-white text-app-muted-strong",
        className,
      )}
    >
      {badge.label}
    </span>
  );
}
