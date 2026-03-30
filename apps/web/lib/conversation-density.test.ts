import { describe, expect, it } from "vitest";

import { conversationDensityClassNames } from "./conversation-density";

describe("conversationDensityClassNames", () => {
  it("keeps the conversation stack tighter than the default sparse layout", () => {
    expect(conversationDensityClassNames.sessionStack).toContain("min-w-0");
    expect(conversationDensityClassNames.sessionStack).toContain("gap-5");
    expect(conversationDensityClassNames.sessionStack).not.toContain("gap-10");
    expect(conversationDensityClassNames.sessionStack).not.toContain("gap-12");
  });

  it("widens user turns and tightens text leading for denser reading", () => {
    expect(conversationDensityClassNames.userWrap).toContain("min-w-0");
    expect(conversationDensityClassNames.userWrap).toContain("max-w-[860px]");
    expect(conversationDensityClassNames.userText).toContain("text-[14px]");
    expect(conversationDensityClassNames.userText).toContain("leading-7");
    expect(conversationDensityClassNames.resultPanel).toContain("min-w-0");
    expect(conversationDensityClassNames.answerText).toContain("text-[14px]");
    expect(conversationDensityClassNames.answerText).toContain("leading-7");
  });

  it("uses a flatter timeline list instead of nested oversized cards", () => {
    expect(conversationDensityClassNames.timelineShell).toContain("max-w-full");
    expect(conversationDensityClassNames.timelineEntry).toContain("border-l-[1.5px]");
    expect(conversationDensityClassNames.timelineEntry).toContain("min-w-0");
    expect(conversationDensityClassNames.timelineEntry).not.toContain("rounded-[20px]");
    expect(conversationDensityClassNames.timelineEntryDetails).toContain("border-t");
    expect(conversationDensityClassNames.timelineEntryMeta).toContain("text-[11px]");
    expect(conversationDensityClassNames.payloadDisclosure).toContain("overflow-hidden");
    expect(conversationDensityClassNames.payloadPre).toContain("max-w-full");
    expect(conversationDensityClassNames.payloadPre).toContain("break-all");
    expect(conversationDensityClassNames.payloadDisclosure).toContain("rounded-xl");
  });

  it("keeps the stage composer compact while preserving attachment visibility", () => {
    expect(conversationDensityClassNames.composerCard).toContain("rounded-[24px]");
    expect(conversationDensityClassNames.composerCard).toContain("px-4");
    expect(conversationDensityClassNames.composerCard).toContain("py-3");
    expect(conversationDensityClassNames.composerText).toContain("text-[14px]");
    expect(conversationDensityClassNames.composerAttachments).toContain("gap-1.5");
  });
});
