import { describe, expect, test } from "vitest";

import { normalizeConversationFailureMessage } from "./conversation-errors";

describe("normalizeConversationFailureMessage", () => {
  test("translates bullmq custom id errors into a clear queue failure message", () => {
    expect(normalizeConversationFailureMessage("Custom Id cannot contain :")).toBe(
      "消息入队失败：队列任务 ID 不能包含冒号，回答还没有真正开始生成。",
    );
  });

  test("unwraps agent runtime json errors before classifying missing anthropic provider", () => {
    expect(
      normalizeConversationFailureMessage(
        'Agent runtime failed: {"ok":false,"error":"Anthropic API key is not configured for report generation."}',
      ),
    ).toBe("Anthropic LLM provider 未配置，请先在 /settings 配置 Anthropic API key。");
  });

  test("keeps unknown failures readable", () => {
    expect(normalizeConversationFailureMessage("queue offline")).toBe("queue offline");
  });
});
