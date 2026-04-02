import { describe, expect, it } from "vitest";

import {
  CONVERSATION_MESSAGE_QUOTE_MAX_LENGTH,
  DEFAULT_QUOTED_FOLLOW_UP_MESSAGE,
  normalizeConversationMessageQuote,
  normalizeConversationMessageQuoteText,
  readConversationMessageQuote,
  resolveConversationUserMessageContent,
  writeConversationMessageQuote,
} from "./conversation-message-quote";

describe("normalizeConversationMessageQuoteText", () => {
  it("trims surrounding whitespace and collapses internal spacing", () => {
    expect(
      normalizeConversationMessageQuoteText("  第一段\n\n  第二段\t\t补充说明  "),
    ).toBe("第一段 第二段 补充说明");
  });

  it("clamps oversized selections to a compact preview length", () => {
    const normalized = normalizeConversationMessageQuoteText(
      "a".repeat(CONVERSATION_MESSAGE_QUOTE_MAX_LENGTH + 40),
    );

    expect(normalized).toHaveLength(CONVERSATION_MESSAGE_QUOTE_MAX_LENGTH);
    expect(normalized.endsWith("...")).toBe(true);
  });
});

describe("normalizeConversationMessageQuote", () => {
  it("returns null for empty or invalid quote payloads", () => {
    expect(normalizeConversationMessageQuote(null)).toBeNull();
    expect(normalizeConversationMessageQuote({ text: "   " })).toBeNull();
  });

  it("normalizes quote payloads and keeps the source assistant id", () => {
    expect(
      normalizeConversationMessageQuote({
        assistantMessageId: "assistant-1",
        text: "  大概是哪个行业（3C、游戏、汽车、教育等）  ",
      }),
    ).toEqual({
      assistantMessageId: "assistant-1",
      text: "大概是哪个行业（3C、游戏、汽车、教育等）",
    });
  });
});

describe("writeConversationMessageQuote / readConversationMessageQuote", () => {
  it("round-trips the quote snapshot inside message structured state", () => {
    const structuredJson = writeConversationMessageQuote({
      quote: {
        assistantMessageId: "assistant-1",
        text: "大概是哪个行业（3C、游戏、汽车、教育等）",
      },
      structuredJson: {
        submitted_attachments: [
          {
            attachmentId: "attachment-1",
            sourceFilename: "brief.md",
          },
        ],
      },
    });

    expect(readConversationMessageQuote(structuredJson)).toEqual({
      assistantMessageId: "assistant-1",
      text: "大概是哪个行业（3C、游戏、汽车、教育等）",
    });
  });
});

describe("resolveConversationUserMessageContent", () => {
  it("keeps the user-authored prompt when it is present", () => {
    expect(
      resolveConversationUserMessageContent({
        content: "  请继续细化预算区间  ",
        quote: {
          assistantMessageId: "assistant-1",
          text: "大概是哪个行业（3C、游戏、汽车、教育等）",
        },
      }),
    ).toBe("请继续细化预算区间");
  });

  it("falls back to a default follow-up prompt when only a quote is provided", () => {
    expect(
      resolveConversationUserMessageContent({
        content: "   ",
        quote: {
          assistantMessageId: "assistant-1",
          text: "大概是哪个行业（3C、游戏、汽车、教育等）",
        },
      }),
    ).toBe(DEFAULT_QUOTED_FOLLOW_UP_MESSAGE);
  });

  it("returns an empty string when neither prompt text nor quote exists", () => {
    expect(
      resolveConversationUserMessageContent({
        content: "   ",
        quote: null,
      }),
    ).toBe("");
  });
});
