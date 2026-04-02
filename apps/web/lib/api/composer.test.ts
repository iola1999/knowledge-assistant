import { describe, expect, it } from "vitest";

import {
  buildComposerSubmittedTurn,
  COMPOSER_ENTER_ACTION,
  COMPOSER_PRIMARY_ACTION,
  resolveComposerEnterKeyAction,
  resolveComposerHeading,
  resolveComposerPrimaryAction,
  resolveComposerStageTextareaSizing,
  resolveComposerSubmitStatus,
} from "./composer";

describe("resolveComposerHeading", () => {
  it("returns null when title and description are both empty", () => {
    expect(
      resolveComposerHeading({
        title: "   ",
        description: "\n",
      }),
    ).toBeNull();
  });

  it("keeps non-empty heading content", () => {
    expect(
      resolveComposerHeading({
        title: "  输入 / 粘贴你的问题  ",
        description: "  直接告诉助手你要完成什么  ",
      }),
    ).toEqual({
      title: "输入 / 粘贴你的问题",
      description: "直接告诉助手你要完成什么",
    });
  });
});

describe("resolveComposerSubmitStatus", () => {
  it("stays silent after a successful submit", () => {
    expect(resolveComposerSubmitStatus()).toBeNull();
    expect(resolveComposerSubmitStatus("   ")).toBeNull();
  });

  it("surfaces agent failures after the message is saved", () => {
    expect(resolveComposerSubmitStatus("queue offline")).toBe(
      "消息已保存，但 Agent 处理失败：queue offline",
    );
  });
});

describe("resolveComposerPrimaryAction", () => {
  it("switches to stop mode while the assistant is streaming", () => {
    expect(
      resolveComposerPrimaryAction({
        content: "",
        hasPendingAttachments: false,
        isStreaming: true,
      }),
    ).toEqual({
      mode: COMPOSER_PRIMARY_ACTION.STOP,
      disabled: false,
    });
  });

  it("disables submit mode when the prompt is empty", () => {
    expect(
      resolveComposerPrimaryAction({
        content: "   ",
        hasPendingAttachments: false,
        isStreaming: false,
      }),
    ).toEqual({
      mode: COMPOSER_PRIMARY_ACTION.SUBMIT,
      disabled: true,
    });
  });

  it("keeps submit disabled while attachments are still pending", () => {
    expect(
      resolveComposerPrimaryAction({
        content: "继续分析",
        hasQuotedSelection: false,
        hasPendingAttachments: true,
        isStreaming: false,
      }),
    ).toEqual({
      mode: COMPOSER_PRIMARY_ACTION.SUBMIT,
      disabled: true,
    });
  });

  it("allows quote-only follow-ups to submit without extra text", () => {
    expect(
      resolveComposerPrimaryAction({
        content: "   ",
        hasQuotedSelection: true,
        hasPendingAttachments: false,
        isStreaming: false,
      }),
    ).toEqual({
      mode: COMPOSER_PRIMARY_ACTION.SUBMIT,
      disabled: false,
    });
  });
});

describe("buildComposerSubmittedTurn", () => {
  it("returns the submitted turn when both saved messages are present", () => {
    expect(
      buildComposerSubmittedTurn({
        conversationId: "conversation-1",
        userMessage: {
          id: "user-1",
          role: "user",
          status: "completed",
          contentMarkdown: "第一条问题",
          structuredJson: null,
        },
        assistantMessage: {
          id: "assistant-1",
          role: "assistant",
          status: "streaming",
          contentMarkdown: "",
          structuredJson: {
            run_started_at: "2026-03-30T12:00:00.000Z",
          },
        },
      }),
    ).toEqual({
      conversationId: "conversation-1",
      userMessage: {
        id: "user-1",
        role: "user",
        status: "completed",
        contentMarkdown: "第一条问题",
        structuredJson: null,
      },
      assistantMessage: {
        id: "assistant-1",
        role: "assistant",
        status: "streaming",
        contentMarkdown: "",
        structuredJson: {
          run_started_at: "2026-03-30T12:00:00.000Z",
        },
      },
    });
  });

  it("returns null when any saved message is missing", () => {
    expect(
      buildComposerSubmittedTurn({
        conversationId: "conversation-1",
        userMessage: null,
        assistantMessage: {
          id: "assistant-1",
          role: "assistant",
          status: "streaming",
          contentMarkdown: "",
          structuredJson: null,
        },
      }),
    ).toBeNull();
    expect(
      buildComposerSubmittedTurn({
        conversationId: "conversation-1",
        userMessage: {
          id: "user-1",
          role: "user",
          status: "completed",
          contentMarkdown: "第一条问题",
          structuredJson: null,
        },
        assistantMessage: null,
      }),
    ).toBeNull();
  });
});

describe("resolveComposerEnterKeyAction", () => {
  it("ignores non-enter keys", () => {
    expect(resolveComposerEnterKeyAction({ key: "a" })).toBe(COMPOSER_ENTER_ACTION.NONE);
  });

  it("keeps shift-enter as a newline", () => {
    expect(resolveComposerEnterKeyAction({ key: "Enter", shiftKey: true })).toBe(
      COMPOSER_ENTER_ACTION.NEWLINE,
    );
  });

  it("submits on plain enter and command-enter", () => {
    expect(resolveComposerEnterKeyAction({ key: "Enter" })).toBe(
      COMPOSER_ENTER_ACTION.SUBMIT,
    );
    expect(
      resolveComposerEnterKeyAction({
        key: "Enter",
        metaKey: true,
      }),
    ).toBe(COMPOSER_ENTER_ACTION.SUBMIT);
  });

  it("does not submit while IME composition is still active", () => {
    expect(
      resolveComposerEnterKeyAction({
        key: "Enter",
        isComposing: true,
      }),
    ).toBe(COMPOSER_ENTER_ACTION.NONE);
    expect(
      resolveComposerEnterKeyAction({
        key: "Enter",
        keyCode: 229,
      }),
    ).toBe(COMPOSER_ENTER_ACTION.NONE);
  });
});

describe("resolveComposerStageTextareaSizing", () => {
  it("keeps the stage composer compact by default", () => {
    expect(resolveComposerStageTextareaSizing()).toEqual({
      minRows: 1,
      minHeight: 28,
      maxHeight: 224,
    });
  });

  it("allows a slightly taller starting point when the page requests more rows", () => {
    expect(resolveComposerStageTextareaSizing(2)).toEqual({
      minRows: 2,
      minHeight: 56,
      maxHeight: 224,
    });
  });

  it("clamps oversized initial rows so the composer does not become bloated again", () => {
    expect(resolveComposerStageTextareaSizing(9)).toEqual({
      minRows: 3,
      minHeight: 84,
      maxHeight: 224,
    });
  });
});
