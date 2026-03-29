import { describe, expect, test } from "vitest";
import { MESSAGE_ROLE, MESSAGE_STATUS } from "@anchordesk/contracts";

import {
  findRegeneratableConversationTurn,
  findRetryableConversationTurn,
} from "./conversation-retry";

describe("findRegeneratableConversationTurn", () => {
  test("returns the latest assistant turn and its preceding user prompt", () => {
    expect(
      findRegeneratableConversationTurn([
        {
          id: "user-1",
          role: MESSAGE_ROLE.USER,
          status: MESSAGE_STATUS.COMPLETED,
          contentMarkdown: "请总结最新讨论",
        },
        {
          id: "assistant-1",
          role: MESSAGE_ROLE.ASSISTANT,
          status: MESSAGE_STATUS.COMPLETED,
          contentMarkdown: "总结如下",
        },
      ]),
    ).toEqual({
      assistantMessageId: "assistant-1",
      userMessageId: "user-1",
      promptContent: "请总结最新讨论",
    });
  });

  test("returns null when the latest turn is not assistant output", () => {
    expect(
      findRegeneratableConversationTurn([
        {
          id: "user-1",
          role: MESSAGE_ROLE.USER,
          status: MESSAGE_STATUS.COMPLETED,
          contentMarkdown: "请总结最新讨论",
        },
      ]),
    ).toBeNull();
  });

  test("returns null while the latest assistant answer is still streaming", () => {
    expect(
      findRegeneratableConversationTurn([
        {
          id: "user-1",
          role: MESSAGE_ROLE.USER,
          status: MESSAGE_STATUS.COMPLETED,
          contentMarkdown: "请总结最新讨论",
        },
        {
          id: "assistant-1",
          role: MESSAGE_ROLE.ASSISTANT,
          status: MESSAGE_STATUS.STREAMING,
          contentMarkdown: "",
        },
      ]),
    ).toBeNull();
  });
});

describe("findRetryableConversationTurn", () => {
  test("returns the latest failed assistant turn and its preceding user prompt", () => {
    expect(
      findRetryableConversationTurn([
        {
          id: "user-1",
          role: MESSAGE_ROLE.USER,
          status: MESSAGE_STATUS.COMPLETED,
          contentMarkdown: "请总结最新讨论",
        },
        {
          id: "assistant-1",
          role: MESSAGE_ROLE.ASSISTANT,
          status: MESSAGE_STATUS.FAILED,
          contentMarkdown: "Agent 处理失败：queue offline",
        },
      ]),
    ).toEqual({
      assistantMessageId: "assistant-1",
      userMessageId: "user-1",
      promptContent: "请总结最新讨论",
    });
  });

  test("returns null when the latest assistant message is not failed", () => {
    expect(
      findRetryableConversationTurn([
        {
          id: "user-1",
          role: MESSAGE_ROLE.USER,
          status: MESSAGE_STATUS.COMPLETED,
          contentMarkdown: "请总结最新讨论",
        },
        {
          id: "assistant-1",
          role: MESSAGE_ROLE.ASSISTANT,
          status: MESSAGE_STATUS.COMPLETED,
          contentMarkdown: "总结如下",
        },
      ]),
    ).toBeNull();
  });

  test("returns null when there is no preceding user turn", () => {
    expect(
      findRetryableConversationTurn([
        {
          id: "assistant-1",
          role: MESSAGE_ROLE.ASSISTANT,
          status: MESSAGE_STATUS.FAILED,
          contentMarkdown: "Agent 处理失败：queue offline",
        },
      ]),
    ).toBeNull();
  });
});
