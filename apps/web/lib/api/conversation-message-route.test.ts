import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildAssistantFailedMessageState,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
} from "@anchordesk/contracts";

const mocks = vi.hoisted(() => {
  const tables = {
    conversationAttachments: Symbol("conversationAttachments"),
    conversations: Symbol("conversations"),
    messages: Symbol("messages"),
  };

  const insertReturningQueue: unknown[][] = [];
  const selectExistingMessages: Array<Record<string, unknown>> = [];
  const updates: Array<{ table: unknown; values: unknown }> = [];

  const enqueueConversationResponse = vi.fn();
  const auth = vi.fn();
  const requireOwnedConversation = vi.fn();
  const buildConversationPrompt = vi.fn();
  const loggerChild = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };

  const db = {
    insert: vi.fn((_table: unknown) => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => insertReturningQueue.shift() ?? []),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => selectExistingMessages),
          })),
        })),
      })),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: unknown) => ({
        where: vi.fn(async () => {
          updates.push({ table, values });
          return [];
        }),
      })),
    })),
  };

  return {
    auth,
    buildConversationPrompt,
    db,
    enqueueConversationResponse,
    insertReturningQueue,
    loggerChild,
    requireOwnedConversation,
    selectExistingMessages,
    tables,
    updates,
  };
});

vi.mock("@/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/guards/resources", () => ({
  requireOwnedConversation: mocks.requireOwnedConversation,
}));

vi.mock("@/lib/api/workspace-prompt", () => ({
  buildConversationPrompt: mocks.buildConversationPrompt,
}));

vi.mock("@/lib/server/logger", () => ({
  buildRequestLogContext: () => ({}),
  logger: {
    child: () => mocks.loggerChild,
  },
  resolveRequestId: () => "request-1",
}));

vi.mock("@anchordesk/queue", () => ({
  enqueueConversationResponse: mocks.enqueueConversationResponse,
}));

vi.mock("@anchordesk/db", () => ({
  conversationAttachments: mocks.tables.conversationAttachments,
  conversations: mocks.tables.conversations,
  getDb: () => mocks.db,
  messages: mocks.tables.messages,
}));

let POST: typeof import("../../app/api/conversations/[conversationId]/messages/route").POST;

beforeAll(async () => {
  ({ POST } = await import("../../app/api/conversations/[conversationId]/messages/route"));
});

beforeEach(() => {
  mocks.insertReturningQueue.length = 0;
  mocks.selectExistingMessages.length = 0;
  mocks.updates.length = 0;
  mocks.enqueueConversationResponse.mockReset();
  mocks.auth.mockReset();
  mocks.requireOwnedConversation.mockReset();
  mocks.buildConversationPrompt.mockReset();
  mocks.loggerChild.error.mockReset();
  mocks.loggerChild.info.mockReset();
  mocks.loggerChild.warn.mockReset();
});

describe("POST /api/conversations/[conversationId]/messages", () => {
  it("returns the failed assistant state when enqueueing the response job fails", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "user-1" },
    });
    mocks.requireOwnedConversation.mockResolvedValue({
      id: "conversation-1",
      workspaceId: "workspace-1",
      workspacePrompt: "空间提示",
    });
    mocks.buildConversationPrompt.mockReturnValue("完整 prompt");
    mocks.selectExistingMessages.push({ id: "user-1" });
    mocks.insertReturningQueue.push(
      [
        {
          id: "user-message-1",
          role: MESSAGE_ROLE.USER,
          status: MESSAGE_STATUS.COMPLETED,
          contentMarkdown: "总结一下",
        },
      ],
      [
        {
          id: "assistant-message-1",
          role: MESSAGE_ROLE.ASSISTANT,
          status: MESSAGE_STATUS.STREAMING,
          contentMarkdown: "",
          structuredJson: null,
        },
      ],
    );
    mocks.enqueueConversationResponse.mockRejectedValue(new Error("queue offline"));

    const response = await POST(
      new Request("http://localhost/api/conversations/conversation-1/messages", {
        body: JSON.stringify({ content: "总结一下" }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
      {
        params: Promise.resolve({ conversationId: "conversation-1" }),
      },
    );
    const body = (await response.json()) as {
      agentError: string;
      assistantMessage: {
        id: string;
        status: string;
        contentMarkdown: string;
        structuredJson: Record<string, unknown> | null;
      };
    };

    expect(response.status).toBe(201);
    expect(body.agentError).toBe("queue offline");
    expect(body.assistantMessage).toEqual({
      id: "assistant-message-1",
      role: MESSAGE_ROLE.ASSISTANT,
      ...buildAssistantFailedMessageState("queue offline"),
    });
    expect(mocks.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: mocks.tables.messages,
          values: buildAssistantFailedMessageState("queue offline"),
        }),
      ]),
    );
  });
});
