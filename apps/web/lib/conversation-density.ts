export const conversationDensityClassNames = {
  sessionStack: "min-w-0 gap-6",
  assistantSection: "grid min-w-0 gap-2 min-[720px]:gap-2.5",
  userWrap: "ml-auto w-full min-w-0 max-w-[860px]",
  userStack: "grid justify-items-end gap-1.5",
  userBubbleRow:
    "group/user-message-row inline-grid min-w-0 max-w-full grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-1.5",
  userActionRail: "flex h-full items-center justify-end",
  userActionButton:
    "size-7 border-transparent bg-transparent text-app-muted-strong shadow-none opacity-0 pointer-events-none translate-y-0.5 transition-[opacity,transform,background-color,color] duration-150 [transition-timing-function:var(--ease-out-quart)] group-hover/user-message-row:pointer-events-auto group-hover/user-message-row:translate-y-0 group-hover/user-message-row:opacity-100 group-focus-within/user-message-row:pointer-events-auto group-focus-within/user-message-row:translate-y-0 group-focus-within/user-message-row:opacity-100 focus-visible:pointer-events-auto focus-visible:translate-y-0 focus-visible:opacity-100 hover:bg-app-surface-soft/82 hover:text-app-text",
  userBubble:
    "min-w-0 rounded-[18px] border border-app-border/60 bg-app-surface-strong/54 px-3.5 py-2.5 shadow-[0_8px_18px_rgba(23,22,18,0.028)] min-[720px]:rounded-[20px] min-[720px]:px-4 min-[720px]:py-3",
  userText: "text-[13px] leading-6 text-app-text md:text-[14px]",
  userAttachmentList: "flex max-w-full flex-wrap justify-end gap-2",
  userAttachmentChip:
    "inline-flex max-w-[min(360px,82vw)] items-center rounded-full border border-app-border/70 bg-white/94 px-2.5 py-1 text-[11px] font-medium text-app-muted-strong shadow-[0_8px_18px_rgba(23,22,18,0.04)] transition hover:border-app-border-strong hover:text-app-text",
  resultPanel: "grid min-w-0 gap-2 min-[720px]:gap-2.5",
  resultHeader:
    "flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-app-border/60 pb-1",
  answerText: "text-[14px] leading-7 text-app-text",
  thinkingPanel:
    "group/thinking min-w-0 max-w-full rounded-[20px] border border-app-border/60 bg-app-surface-soft/68 px-3 py-2.5 shadow-[0_6px_16px_rgba(23,22,18,0.018)]",
  thinkingSummary:
    "flex cursor-pointer list-none items-center justify-between gap-2.5 text-[12px] [&::-webkit-details-marker]:hidden",
  thinkingMeta:
    "inline-flex items-center rounded-full border border-app-border/70 bg-white/76 px-1.5 py-0.5 text-[9.5px] font-medium tracking-[0.02em] text-app-muted-strong",
  thinkingBody: "mt-1.5 border-t border-app-border/55 pt-2",
  thinkingText:
    "min-w-0 whitespace-pre-wrap break-words text-[12px] leading-5 text-app-muted-strong",
  sourcesList: "grid gap-1.5",
  sourceCard:
    "grid min-w-0 gap-1 rounded-[16px] border border-app-border/55 bg-white/72 px-2.5 py-2 text-left transition hover:border-app-border-strong hover:bg-white",
  actionStatus: "text-[11px] leading-4.5 text-app-muted",
  timelineShell: "group min-w-0 max-w-full",
  timelineList: "mt-2.5 grid min-w-0 gap-3",
  timelineEntry: "group/timeline-entry relative grid min-w-0 gap-0 text-app-muted-strong",
  timelineEntrySummary:
    "grid min-w-0 list-none grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-2 text-left [&::-webkit-details-marker]:hidden",
  timelineEntryRail: "relative z-10 flex items-start justify-center pt-1",
  timelineEntryCard: "rounded-[14px] bg-app-surface-lowest/70 px-4 py-3",
  timelineEntryHeader: "flex min-w-0 items-start justify-between gap-2.5",
  timelineEntryBody: "grid min-w-0 gap-1.5",
  timelineEntryTitleRow: "flex min-w-0 flex-wrap items-center gap-2",
  timelineEntryTime: "shrink-0 pt-0.5 text-[10px] text-app-muted",
  timelineEntryDetails: "grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)] gap-2",
  timelineEntryDetailsPanel: "grid min-w-0 gap-1",
  timelineEntrySection: "grid min-w-0 gap-1.5",
  timelineEntrySectionTitle:
    "text-[10px] font-semibold uppercase tracking-[0.12em] text-app-muted",
  timelineStatusPill:
    "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9.5px] font-semibold",
  timelineArgumentList: "flex flex-wrap gap-1.5",
  timelineArgument:
    "flex min-w-0 items-center gap-1.5 text-[10.5px] leading-4 text-app-muted-strong",
  timelineArgumentLabel: "shrink-0 font-medium text-app-muted",
  timelineArgumentValue: "min-w-0 break-words text-app-text",
  timelineSummaryText: "text-[11px] leading-4.5 text-app-muted-strong [overflow-wrap:anywhere]",
  timelinePreviewList: "grid min-w-0 gap-1",
  timelinePreviewItem: "flex min-w-0 items-center gap-2 text-left transition",
  timelinePreviewLabelRow: "flex items-center gap-2 text-[10px] text-app-muted",
  timelinePreviewValue: "text-[11px] leading-4.5 text-app-text [overflow-wrap:anywhere]",
  timelinePreviewMeta: "text-[10px] leading-4 text-app-muted",
  payloadDisclosure:
    "inline-flex max-w-full items-center gap-1 text-[10px] font-medium text-app-muted-strong transition hover:text-app-text",
  payloadPre:
    "min-w-0 max-w-full max-h-[180px] overflow-auto whitespace-pre-wrap break-all [overflow-wrap:anywhere] select-text rounded-[8px] bg-app-surface-soft/62 px-2 py-1.5 text-[9.5px] leading-4 text-app-muted-strong",
  composerShell:
    "sticky bottom-0 z-10 bg-linear-to-t from-app-bg via-app-bg/92 to-transparent px-0 pb-1 pt-8 backdrop-blur-xl",
  composerCard:
    "rounded-[16px] border border-[color:color-mix(in_srgb,var(--outline-variant)_14%,transparent)] bg-white/78 px-4 py-3 shadow-[0_28px_60px_rgba(25,28,30,0.06)] backdrop-blur-xl",
  composerText:
    "w-full resize-none bg-transparent px-0 py-0 text-[13px] leading-6 text-app-text outline-none placeholder:text-app-muted md:text-[14px]",
  composerAttachments: "flex flex-wrap items-center gap-1 px-0",
} as const;
