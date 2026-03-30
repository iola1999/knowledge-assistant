import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildAssistantFailedMessageState,
  buildRunFailedToolMessageState,
  MESSAGE_STATUS,
} from "@anchordesk/contracts";

const mocks = vi.hoisted(() => {
  const tables = {
    conversations: Symbol("conversations"),
    messages: Symbol("messages"),
    citationAnchors: Symbol("citationAnchors"),
    messageCitations: Symbol("messageCitations"),
  };

  const queryResults = {
    conversations: [] as Array<Record<string, unknown>>,
    messages: [] as Array<Record<string, unknown>>,
    citationAnchors: [] as Array<Record<string, unknown>>,
  };

  const inserts: Array<{ table: unknown; values: unknown }> = [];
  const updates: Array<{ table: unknown; values: unknown }> = [];
  const runAgentResponse = vi.fn();
  const loggerChild = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const db = {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => {
            if (table === tables.conversations) {
              return queryResults.conversations;
            }

            if (table === tables.messages) {
              return queryResults.messages;
            }

            if (table === tables.citationAnchors) {
              return queryResults.citationAnchors;
            }

            return [];
          }),
        })),
      })),
    })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn(async (values: unknown) => {
        inserts.push({ table, values });
        return [];
      }),
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
    db,
    inserts,
    loggerChild,
    queryResults,
    runAgentResponse,
    tables,
    updates,
  };
});

vi.mock("@anchordesk/db", () => ({
  citationAnchors: mocks.tables.citationAnchors,
  conversations: mocks.tables.conversations,
  getDb: () => mocks.db,
  getKnowledgeSourceScope: () => "workspace_private",
  messageCitations: mocks.tables.messageCitations,
  messages: mocks.tables.messages,
  knowledgeLibraries: Symbol("knowledgeLibraries"),
  resolveWorkspaceLibraryScope: async () => ({
    accessibleLibraryIds: [],
  }),
}));

vi.mock("./run-agent-response", () => ({
  runAgentResponse: mocks.runAgentResponse,
}));

vi.mock("./logger", () => ({
  logger: {
    child: () => mocks.loggerChild,
  },
}));

let processConversationResponseJob: typeof import("./process-conversation-job").processConversationResponseJob;

beforeAll(async () => {
  ({ processConversationResponseJob } = await import("./process-conversation-job"));
});

beforeEach(() => {
  mocks.queryResults.conversations = [];
  mocks.queryResults.messages = [];
  mocks.queryResults.citationAnchors = [];
  mocks.inserts.length = 0;
  mocks.updates.length = 0;
  mocks.runAgentResponse.mockReset();
  mocks.loggerChild.debug.mockReset();
  mocks.loggerChild.info.mockReset();
  mocks.loggerChild.warn.mockReset();
  mocks.loggerChild.error.mockReset();
});

describe("processConversationResponseJob", () => {
  it("skips jobs whose assistant placeholder is no longer streaming", async () => {
    mocks.queryResults.conversations = [
      {
        id: "conversation-1",
        workspaceId: "workspace-1",
        agentSessionId: null,
        agentWorkdir: null,
      },
    ];
    mocks.queryResults.messages = [
      {
        id: "assistant-1",
        conversationId: "conversation-1",
        status: MESSAGE_STATUS.COMPLETED,
        contentMarkdown: "已有回答",
        structuredJson: null,
      },
    ];

    await processConversationResponseJob({
      assistantMessageId: "assistant-1",
      conversationId: "conversation-1",
      prompt: "总结一下",
      userMessageId: "user-1",
    });

    expect(mocks.runAgentResponse).not.toHaveBeenCalled();
    expect(mocks.inserts).toEqual([]);
    expect(mocks.updates).toEqual([]);
  });

  it("persists final assistant state and tool timeline events on success", async () => {
    mocks.queryResults.conversations = [
      {
        id: "conversation-1",
        workspaceId: "workspace-1",
        agentSessionId: null,
        agentWorkdir: null,
      },
    ];
    mocks.queryResults.messages = [
      {
        id: "assistant-1",
        conversationId: "conversation-1",
        status: MESSAGE_STATUS.STREAMING,
        contentMarkdown: "",
        structuredJson: null,
      },
    ];
    mocks.runAgentResponse.mockImplementation(async (_input, hooks) => {
      await hooks?.onToolStarted?.({
        toolInput: { query: "总结一下" },
        toolName: "search_workspace_knowledge",
        toolUseId: "tool-1",
      });
      await hooks?.onToolFinished?.({
        toolInput: { query: "总结一下" },
        toolName: "search_workspace_knowledge",
        toolResponse: { ok: true },
        toolUseId: "tool-1",
      });
      await hooks?.onAssistantDelta?.({
        textDelta: "第一段",
        fullText: "第一段",
      });

      return {
        citations: [],
        ok: true as const,
        sessionId: "session-1",
        text: "最终回答",
        workdir: "/tmp/agent-session",
      };
    });

    await processConversationResponseJob({
      assistantMessageId: "assistant-1",
      conversationId: "conversation-1",
      prompt: "总结一下",
      userMessageId: "user-1",
    });

    expect(mocks.runAgentResponse).toHaveBeenCalledTimes(1);
    expect(mocks.inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: mocks.tables.messages,
          values: expect.objectContaining({
            conversationId: "conversation-1",
            contentMarkdown: "开始调用工具：search_workspace_knowledge",
            role: "tool",
            status: "streaming",
            structuredJson: {
              timeline_event: "tool_started",
              tool_name: "search_workspace_knowledge",
              tool_input: {
                query: "总结一下",
              },
              tool_response: null,
              tool_use_id: "tool-1",
            },
          }),
        }),
        expect.objectContaining({
          table: mocks.tables.messages,
          values: expect.objectContaining({
            conversationId: "conversation-1",
            contentMarkdown: "工具执行完成：search_workspace_knowledge",
            role: "tool",
            status: "completed",
            structuredJson: {
              timeline_event: "tool_finished",
              tool_name: "search_workspace_knowledge",
              tool_input: {
                query: "总结一下",
              },
              tool_response: {
                ok: true,
              },
              tool_use_id: "tool-1",
            },
          }),
        }),
      ]),
    );
    expect(mocks.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: mocks.tables.messages,
          values: expect.objectContaining({
            contentMarkdown: "第一段",
          }),
        }),
        expect.objectContaining({
          table: mocks.tables.messages,
          values: {
            contentMarkdown: "最终回答",
            status: MESSAGE_STATUS.COMPLETED,
            structuredJson: null,
          },
        }),
        expect.objectContaining({
          table: mocks.tables.conversations,
          values: expect.objectContaining({
            agentSessionId: "session-1",
            agentWorkdir: "/tmp/agent-session",
            updatedAt: expect.any(Date),
          }),
        }),
      ]),
    );
  });

  it("writes normalized failed assistant and tool payloads when agent execution fails", async () => {
    mocks.queryResults.conversations = [
      {
        id: "conversation-1",
        workspaceId: "workspace-1",
        agentSessionId: null,
        agentWorkdir: null,
      },
    ];
    mocks.queryResults.messages = [
      {
        id: "assistant-1",
        conversationId: "conversation-1",
        status: MESSAGE_STATUS.STREAMING,
        contentMarkdown: "",
        structuredJson: null,
      },
    ];
    mocks.runAgentResponse.mockRejectedValue(new Error("queue offline"));

    await processConversationResponseJob({
      assistantMessageId: "assistant-1",
      conversationId: "conversation-1",
      prompt: "总结一下",
      userMessageId: "user-1",
    });

    expect(mocks.runAgentResponse).toHaveBeenCalledTimes(1);
    expect(mocks.inserts).toEqual(
      expect.arrayContaining([
        {
          table: mocks.tables.messages,
          values: {
            conversationId: "conversation-1",
            role: "tool",
            ...buildRunFailedToolMessageState("queue offline"),
          },
        },
      ]),
    );
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
