export const conversationDensityClassNames = {
  sessionStack: "grid min-w-0 gap-5 pb-3 min-[720px]:gap-6 min-[720px]:pb-4 md:gap-7 md:pb-5",
  assistantSection: "grid min-w-0 gap-2.5 min-[720px]:gap-3",
  userWrap: "ml-auto w-full min-w-0 max-w-[860px]",
  userStack: "grid justify-items-end gap-2",
  userBubble:
    "min-w-0 rounded-[20px] border border-app-border/60 bg-app-surface-strong/54 px-4 py-3 shadow-[0_10px_24px_rgba(23,22,18,0.03)] min-[720px]:rounded-[22px] min-[720px]:px-5 min-[720px]:py-3.5",
  userText: "text-[14px] leading-7 text-app-text md:text-[15px]",
  userAttachmentList: "flex max-w-full flex-wrap justify-end gap-2",
  userAttachmentChip:
    "inline-flex max-w-[min(360px,82vw)] items-center rounded-full border border-app-border/70 bg-white/94 px-3 py-1.5 text-[12px] font-medium text-app-muted-strong shadow-[0_8px_18px_rgba(23,22,18,0.04)] transition hover:border-app-border-strong hover:text-app-text",
  resultPanel: "grid min-w-0 gap-2.5 min-[720px]:gap-3",
  resultHeader:
    "flex min-w-0 flex-wrap items-center justify-between gap-2.5 border-b border-app-border/60 pb-1.5",
  answerText: "max-w-none text-[14px] leading-7 text-app-text md:text-[15px]",
  thinkingPanel:
    "group/thinking min-w-0 max-w-full rounded-2xl border border-app-border/60 bg-app-surface-soft/68 px-3.5 py-3 shadow-[0_6px_18px_rgba(23,22,18,0.02)]",
  thinkingSummary:
    "flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] [&::-webkit-details-marker]:hidden",
  thinkingMeta:
    "inline-flex items-center rounded-full border border-app-border/70 bg-white/76 px-2 py-0.5 text-[10px] font-medium tracking-[0.02em] text-app-muted-strong",
  thinkingBody: "mt-2 border-t border-app-border/55 pt-2.5",
  thinkingText:
    "min-w-0 whitespace-pre-wrap break-words text-[13px] leading-6 text-app-muted-strong",
  sourcesList: "grid gap-2",
  sourceCard:
    "grid min-w-0 gap-1 rounded-[18px] border border-app-border/55 bg-white/72 px-3 py-2 text-left transition hover:border-app-border-strong hover:bg-white",
  actionStatus: "text-[12px] leading-5 text-app-muted",
  timelineShell: "group min-w-0 max-w-full",
  timelineList: "mt-3 grid min-w-0 gap-4",
  timelineEntry: "group/timeline-entry relative grid min-w-0 gap-0 text-app-muted-strong",
  timelineEntrySummary:
    "grid min-w-0 list-none grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-2 text-left [&::-webkit-details-marker]:hidden",
  timelineEntryRail: "relative z-10 flex items-start justify-center pt-1",
  timelineEntryCard: "grid min-w-0 gap-1.5",
  timelineEntryHeader: "flex min-w-0 items-start justify-between gap-3",
  timelineEntryBody: "grid min-w-0 gap-2",
  timelineEntryTitleRow: "flex min-w-0 flex-wrap items-center gap-2",
  timelineEntryTime: "shrink-0 pt-0.5 text-[11px] text-app-muted",
  timelineEntryDetails: "grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)] gap-2",
  timelineEntryDetailsPanel: "grid min-w-0 gap-1.5",
  timelineEntrySection: "grid min-w-0 gap-2",
  timelineEntrySectionTitle:
    "text-[11px] font-semibold uppercase tracking-[0.12em] text-app-muted",
  timelineStatusPill:
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
  timelineArgumentList: "flex flex-wrap gap-2",
  timelineArgument:
    "flex min-w-0 items-center gap-2 text-[11px] leading-4.5 text-app-muted-strong",
  timelineArgumentLabel: "shrink-0 font-medium text-app-muted",
  timelineArgumentValue: "min-w-0 break-words text-app-text",
  timelineSummaryText: "text-[12px] leading-5 text-app-muted-strong [overflow-wrap:anywhere]",
  timelinePreviewList: "grid min-w-0 gap-1.5",
  timelinePreviewItem: "flex min-w-0 items-center gap-2 text-left transition",
  timelinePreviewLabelRow: "flex items-center gap-2 text-[11px] text-app-muted",
  timelinePreviewValue: "text-[12px] leading-5 text-app-text [overflow-wrap:anywhere]",
  timelinePreviewMeta: "text-[11px] leading-4 text-app-muted",
  payloadDisclosure:
    "inline-flex max-w-full items-center gap-1 text-[10.5px] font-medium text-app-muted-strong transition hover:text-app-text",
  payloadPre:
    "min-w-0 max-w-full max-h-[180px] overflow-auto whitespace-pre-wrap break-all [overflow-wrap:anywhere] select-text rounded-[10px] bg-app-surface-soft/62 px-2.5 py-2 text-[10px] leading-4.5 text-app-muted-strong",
  composerShell:
    "sticky bottom-0 z-10 shrink-0 px-4 pb-3 pt-3 min-[720px]:pb-4 min-[720px]:pt-4",
  composerCard:
    "grid min-w-0 gap-2.5 rounded-[24px] border border-app-border/80 bg-white/96 px-4 py-3 shadow-[0_16px_28px_rgba(23,22,18,0.06),0_3px_8px_rgba(23,22,18,0.03)] md:px-5 md:py-4",
  composerText:
    "w-full resize-none bg-transparent px-0 py-0 text-[14px] leading-7 text-app-text outline-none placeholder:text-app-muted md:text-[15px]",
  composerAttachments: "flex flex-wrap items-center gap-1.5 px-0.5",
} as const;
