import { describe, expect, it } from "vitest";

import { conversationDensityClassNames } from "./conversation-density";

describe("conversationDensityClassNames", () => {
  it("keeps the conversation stack tighter than the default sparse layout", () => {
    expect(conversationDensityClassNames.sessionStack).toContain("min-w-0");
    expect(conversationDensityClassNames.sessionStack).toContain("gap-6");
    expect(conversationDensityClassNames.sessionStack).not.toContain("gap-10");
    expect(conversationDensityClassNames.sessionStack).not.toContain("gap-12");
  });

  it("widens user turns and tightens text leading for denser reading", () => {
    expect(conversationDensityClassNames.userWrap).toContain("min-w-0");
    expect(conversationDensityClassNames.userWrap).toContain("max-w-[860px]");
    expect(conversationDensityClassNames.userStack).toContain("justify-items-end");
    expect(conversationDensityClassNames.userText).toContain("text-[13px]");
    expect(conversationDensityClassNames.userText).toContain("leading-6");
    expect(conversationDensityClassNames.userAttachmentList).toContain("justify-end");
    expect(conversationDensityClassNames.userAttachmentChip).toContain("rounded-full");
    expect(conversationDensityClassNames.resultPanel).toContain("min-w-0");
    expect(conversationDensityClassNames.answerText).toContain("text-[14px]");
    expect(conversationDensityClassNames.answerText).toContain("leading-7");
  });

  it("uses a stepped timeline layout with a vertical rail and borderless task rows", () => {
    expect(conversationDensityClassNames.timelineShell).toContain("max-w-full");
    expect(conversationDensityClassNames.timelineShell).not.toContain("border");
    expect(conversationDensityClassNames.timelineEntry).toContain("group/timeline-entry");
    expect(conversationDensityClassNames.timelineEntrySummary).toContain(
      "grid-cols-[1.5rem_minmax(0,1fr)]",
    );
    expect(conversationDensityClassNames.timelineList).toContain("gap-3");
    expect(conversationDensityClassNames.timelineEntryCard).not.toContain("border");
    expect(conversationDensityClassNames.timelineEntryDetails).toContain(
      "grid-cols-[1.5rem_minmax(0,1fr)]",
    );
    expect(conversationDensityClassNames.timelineArgument).toContain("text-[10.5px]");
    expect(conversationDensityClassNames.timelinePreviewList).toContain("gap-1");
    expect(conversationDensityClassNames.timelinePreviewItem).toContain("items-center");
    expect(conversationDensityClassNames.payloadDisclosure).not.toContain("border");
    expect(conversationDensityClassNames.payloadPre).toContain("max-w-full");
    expect(conversationDensityClassNames.payloadPre).toContain("max-h-[180px]");
    expect(conversationDensityClassNames.payloadPre).toContain("break-all");
    expect(conversationDensityClassNames.payloadPre).toContain("select-text");
    expect(conversationDensityClassNames.payloadPre).toContain("bg-app-surface-soft/62");
  });

  it("keeps the stage composer sticky while preserving attachment visibility", () => {
    expect(conversationDensityClassNames.composerShell).toContain("sticky");
    expect(conversationDensityClassNames.composerShell).toContain("bottom-0");
    expect(conversationDensityClassNames.composerShell).toContain("border-t");
    expect(conversationDensityClassNames.composerShell).not.toContain("backdrop-blur");
    expect(conversationDensityClassNames.composerCard).toContain("rounded-[16px]");
    expect(conversationDensityClassNames.composerCard).toContain("border");
    expect(conversationDensityClassNames.composerCard).toContain("px-3.5");
    expect(conversationDensityClassNames.composerCard).toContain("py-2.5");
    expect(conversationDensityClassNames.composerCard).toContain("shadow-[0_1px_2px");
    expect(conversationDensityClassNames.composerText).toContain("text-[13px]");
    expect(conversationDensityClassNames.composerAttachments).toContain("gap-1");
  });

  it("uses a crisp bordered composer shell instead of the old glass haze", () => {
    expect(conversationDensityClassNames.composerShell).toContain("bg-app-bg/96");
    expect(conversationDensityClassNames.composerCard).toContain("rounded-[16px]");
    expect(conversationDensityClassNames.composerCard).toContain("bg-app-surface-lowest");
    expect(conversationDensityClassNames.composerCard).not.toContain("rounded-[20px]");
    expect(conversationDensityClassNames.composerCard).not.toContain("backdrop-blur");
  });

  it("keeps answer surfaces border-light and typography-led", () => {
    expect(conversationDensityClassNames.answerText).toContain("leading-7");
    expect(conversationDensityClassNames.timelineEntryCard).not.toContain("shadow-soft");
  });
});
