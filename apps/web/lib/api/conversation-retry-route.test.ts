import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildAssistantFailedMessageState,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
} from "@anchordesk/contracts";

const mocks = vi.hoisted(() => {
  const tables = {
    conversations: Symbol("conversations"),
    messageCitations: Symbol("messageCitations"),
    messages: Symbol("messages"),
  };

  const recentChatMessages: Array<Record<string, unknown>> = [];
  const updates: Array<{ table: unknown; values: unknown }> = [];
  const deletes: Array<{ table: unknown }> = [];

  const enqueueConversationResponse = vi.fn();
  const auth = vi.fn();
  const requireOwnedConversation = vi.fn();
  const resolveSelectedModelProfile = vi.fn();
  const buildConversationPrompt = vi.fn();
  const findRegeneratableConversationTurn = vi.fn();
  const loggerChild = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };

  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => recentChatMessages),
          })),
        })),
      })),
    })),
    delete: vi.fn((table: unknown) => ({
      where: vi.fn(async () => {
        deletes.push({ table });
        return [];
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: unknown) => ({
        where: vi.fn(() => {
          updates.push({ table, values });
          return {
            returning: vi.fn(async () => [
              {
                id: "assistant-message-1",
                role: MESSAGE_ROLE.ASSISTANT,
                status: MESSAGE_STATUS.STREAMING,
                contentMarkdown: "",
                structuredJson: (values as { structuredJson?: Record<string, unknown> })
                  .structuredJson,
              },
            ]),
          };
        }),
      })),
    })),
  };

  return {
    auth,
    buildConversationPrompt,
    db,
    deletes,
    enqueueConversationResponse,
    findRegeneratableConversationTurn,
    loggerChild,
    recentChatMessages,
    requireOwnedConversation,
    resolveSelectedModelProfile,
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

vi.mock("@/lib/api/conversation-retry", () => ({
  findRegeneratableConversationTurn: mocks.findRegeneratableConversationTurn,
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
  conversations: mocks.tables.conversations,
  getDb: () => mocks.db,
  messageCitations: mocks.tables.messageCitations,
  messages: mocks.tables.messages,
  resolveSelectedModelProfile: mocks.resolveSelectedModelProfile,
}));

let POST: typeof import("../../app/api/conversations/[conversationId]/retry/route").POST;

beforeAll(async () => {
  ({ POST } = await import("../../app/api/conversations/[conversationId]/retry/route"));
});

beforeEach(() => {
  mocks.recentChatMessages.length = 0;
  mocks.updates.length = 0;
  mocks.deletes.length = 0;
  mocks.enqueueConversationResponse.mockReset();
  mocks.auth.mockReset();
  mocks.requireOwnedConversation.mockReset();
  mocks.resolveSelectedModelProfile.mockReset();
  mocks.buildConversationPrompt.mockReset();
  mocks.findRegeneratableConversationTurn.mockReset();
  mocks.loggerChild.error.mockReset();
  mocks.loggerChild.info.mockReset();
  mocks.loggerChild.warn.mockReset();
});

describe("POST /api/conversations/[conversationId]/retry", () => {
  it("restores the assistant failure state when re-enqueueing fails", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "user-1" },
    });
    mocks.requireOwnedConversation.mockResolvedValue({
      id: "conversation-1",
      workspaceId: "workspace-1",
      workspacePrompt: "空间提示",
      modelProfileId: "model-profile-1",
    });
    mocks.resolveSelectedModelProfile.mockResolvedValue({
      id: "model-profile-1",
    });
    mocks.buildConversationPrompt.mockReturnValue("完整 prompt");
    mocks.recentChatMessages.push({
      id: "assistant-message-1",
      role: MESSAGE_ROLE.ASSISTANT,
      status: MESSAGE_STATUS.FAILED,
      contentMarkdown: "Agent 处理失败：queue offline",
    });
    mocks.findRegeneratableConversationTurn.mockReturnValue({
      assistantMessageId: "assistant-message-1",
      userMessageId: "user-message-1",
      promptContent: "总结一下",
    });
    mocks.enqueueConversationResponse.mockRejectedValue(new Error("queue offline"));

    const response = await POST(
      new Request("http://localhost/api/conversations/conversation-1/retry", {
        method: "POST",
      }),
      {
        params: Promise.resolve({ conversationId: "conversation-1" }),
      },
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe("重新生成失败：queue offline");
    expect(mocks.deletes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: mocks.tables.messageCitations,
        }),
      ]),
    );
    expect(mocks.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: mocks.tables.messages,
          values: expect.objectContaining({
            ...buildAssistantFailedMessageState("queue offline"),
            structuredJson: expect.objectContaining({
              agent_error: "queue offline",
              run_id: expect.any(String),
            }),
          }),
        }),
      ]),
    );
    const retryStreamingUpdate = mocks.updates.find(
      (entry) =>
        entry.table === mocks.tables.messages &&
        (entry.values as Record<string, unknown>).status === MESSAGE_STATUS.STREAMING,
    );
    expect(retryStreamingUpdate).toBeDefined();
    expect(mocks.enqueueConversationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantMessageId: "assistant-message-1",
        modelProfileId: "model-profile-1",
        runId: (retryStreamingUpdate?.values as { structuredJson?: { run_id?: string } }).structuredJson
          ?.run_id,
      }),
    );
  });

  it("reuses quoted follow-up context when retrying a failed answer", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "user-1" },
    });
    mocks.requireOwnedConversation.mockResolvedValue({
      id: "conversation-1",
      workspaceId: "workspace-1",
      workspacePrompt: "空间提示",
      modelProfileId: "model-profile-1",
    });
    mocks.resolveSelectedModelProfile.mockResolvedValue({
      id: "model-profile-1",
    });
    mocks.buildConversationPrompt.mockReturnValue("完整 prompt");
    mocks.enqueueConversationResponse.mockResolvedValue({
      id: "job-1",
    });
    mocks.findRegeneratableConversationTurn.mockReturnValue({
      assistantMessageId: "assistant-message-1",
      userMessageId: "user-message-1",
      promptContent: "请继续展开说明。",
      quote: {
        assistantMessageId: "assistant-0",
        text: "大概是哪个行业（3C、游戏、汽车、教育等）",
      },
    });

    const response = await POST(
      new Request("http://localhost/api/conversations/conversation-1/retry", {
        method: "POST",
      }),
      {
        params: Promise.resolve({ conversationId: "conversation-1" }),
      },
    );

    expect(response.status).toBe(202);
    expect(mocks.buildConversationPrompt).toHaveBeenCalledWith({
      content: "请继续展开说明。",
      workspacePrompt: "空间提示",
      quote: {
        assistantMessageId: "assistant-0",
        text: "大概是哪个行业（3C、游戏、汽车、教育等）",
      },
    });
  });
});
