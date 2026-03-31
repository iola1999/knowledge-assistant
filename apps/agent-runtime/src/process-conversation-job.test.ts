import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildAssistantFailedMessageState,
  buildRunFailedToolMessageState,
  CONVERSATION_STREAM_EVENT,
  MESSAGE_STATUS,
} from "@anchordesk/contracts";

const DEFAULT_MODEL_PROFILE = {
  id: "model-profile-1",
  apiType: "anthropic",
  displayName: "Sonnet 4.5",
  modelName: "claude-sonnet-4-5",
  baseUrl: "https://api.anthropic.com",
  apiKey: "sk-test",
  enabled: true,
  isDefault: true,
} as const;

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
    messageSequence: [] as Array<Array<Record<string, unknown>>>,
    citationAnchors: [] as Array<Record<string, unknown>>,
  };

  const inserts: Array<{ table: unknown; values: unknown }> = [];
  const insertReturningQueue: Array<Array<Record<string, unknown>>> = [];
  const updates: Array<{ table: unknown; values: unknown }> = [];
  const runAgentResponse = vi.fn();
  const summarizeWorkspaceSearchableKnowledge = vi.fn(async () => ({
    hasReadySearchableKnowledge: false,
    totalReadyDocumentCount: 0,
    readyPrivateDocumentCount: 0,
    readyGlobalDocumentCount: 0,
    searchableGlobalLibraryCount: 0,
  }));
  const resolveDefaultUsableModelProfile = vi.fn();
  const resolveUsableModelProfileById = vi.fn();
  const appendConversationStreamEvent = vi.fn(async () => "1743490000000-0");
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
              if (queryResults.messageSequence.length > 0) {
                return queryResults.messageSequence.shift() ?? [];
              }
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
      values: vi.fn((values: unknown) => {
        inserts.push({ table, values });
        return {
          returning: vi.fn(async () => insertReturningQueue.shift() ?? []),
        };
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
    appendConversationStreamEvent,
    inserts,
    insertReturningQueue,
    loggerChild,
    queryResults,
    resolveDefaultUsableModelProfile,
    resolveUsableModelProfileById,
    runAgentResponse,
    summarizeWorkspaceSearchableKnowledge,
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
  resolveDefaultUsableModelProfile: mocks.resolveDefaultUsableModelProfile,
  resolveUsableModelProfileById: mocks.resolveUsableModelProfileById,
  resolveWorkspaceLibraryScope: async () => ({
    accessibleLibraryIds: [],
  }),
  summarizeWorkspaceSearchableKnowledge: mocks.summarizeWorkspaceSearchableKnowledge,
}));

vi.mock("./run-agent-response", () => ({
  runAgentResponse: mocks.runAgentResponse,
}));

vi.mock("@anchordesk/queue", () => ({
  appendConversationStreamEvent: mocks.appendConversationStreamEvent,
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
  mocks.queryResults.messageSequence = [];
  mocks.queryResults.citationAnchors = [];
  mocks.inserts.length = 0;
  mocks.insertReturningQueue.length = 0;
  mocks.updates.length = 0;
  mocks.runAgentResponse.mockReset();
  mocks.summarizeWorkspaceSearchableKnowledge.mockReset();
  mocks.summarizeWorkspaceSearchableKnowledge.mockResolvedValue({
    hasReadySearchableKnowledge: false,
    totalReadyDocumentCount: 0,
    readyPrivateDocumentCount: 0,
    readyGlobalDocumentCount: 0,
    searchableGlobalLibraryCount: 0,
  });
  mocks.resolveDefaultUsableModelProfile.mockReset();
  mocks.resolveUsableModelProfileById.mockReset();
  mocks.resolveDefaultUsableModelProfile.mockResolvedValue(DEFAULT_MODEL_PROFILE);
  mocks.resolveUsableModelProfileById.mockResolvedValue(DEFAULT_MODEL_PROFILE);
  mocks.appendConversationStreamEvent.mockReset();
  mocks.appendConversationStreamEvent.mockImplementation(async () => "1743490000000-0");
  mocks.loggerChild.debug.mockReset();
  mocks.loggerChild.info.mockReset();
  mocks.loggerChild.warn.mockReset();
  mocks.loggerChild.error.mockReset();
});

function readAnswerDeltaEvents() {
  const calls = mocks.appendConversationStreamEvent.mock.calls as unknown as Array<
    Array<{ event?: unknown }>
  >;

  return calls
    .flatMap((call) => {
      const input = call[0];
      return input?.event ? [input.event] : [];
    })
    .filter(
      (
        event,
      ): event is {
        type: typeof CONVERSATION_STREAM_EVENT.ANSWER_DELTA;
        content_markdown: string;
        delta_text?: string | null;
      } =>
        Boolean(event) &&
        typeof event === "object" &&
        "type" in event &&
        event.type === CONVERSATION_STREAM_EVENT.ANSWER_DELTA,
    );
}

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
      runId: "run-1",
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
        structuredJson: {
          run_id: "run-1",
          run_started_at: "2026-03-31T10:00:00.000Z",
          run_last_heartbeat_at: "2026-03-31T10:00:00.000Z",
          run_lease_expires_at: "2026-03-31T10:00:45.000Z",
        },
      },
    ];
    mocks.insertReturningQueue.push(
      [
        {
          id: "tool-message-started",
          status: MESSAGE_STATUS.STREAMING,
          contentMarkdown: "开始调用工具：search_workspace_knowledge",
          createdAt: new Date("2026-03-31T10:00:00.000Z"),
          structuredJson: {
            timeline_event: "tool_started",
            tool_name: "search_workspace_knowledge",
            tool_input: {
              query: "总结一下",
            },
            tool_response: null,
            tool_use_id: "tool-1",
          },
        },
      ],
      [
        {
          id: "tool-message-finished",
          status: MESSAGE_STATUS.COMPLETED,
          contentMarkdown: "工具执行完成：search_workspace_knowledge",
          createdAt: new Date("2026-03-31T10:00:01.000Z"),
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
        },
      ],
      [],
    );
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
      modelProfileId: "model-profile-1",
      runId: "run-1",
      prompt: "总结一下",
      userMessageId: "user-1",
    });

    expect(mocks.runAgentResponse).toHaveBeenCalledTimes(1);
    expect(mocks.resolveUsableModelProfileById).toHaveBeenCalledWith(
      "model-profile-1",
      mocks.db,
    );
    expect(mocks.resolveDefaultUsableModelProfile).not.toHaveBeenCalled();
    expect(mocks.runAgentResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conversation-1",
        modelProfile: expect.objectContaining({
          id: "model-profile-1",
          modelName: "claude-sonnet-4-5",
        }),
        searchableKnowledge: {
          hasReadySearchableKnowledge: false,
          totalReadyDocumentCount: 0,
          readyPrivateDocumentCount: 0,
          readyGlobalDocumentCount: 0,
          searchableGlobalLibraryCount: 0,
        },
      }),
      expect.any(Object),
    );
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
              assistant_message_id: "assistant-1",
              assistant_run_id: "run-1",
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
              assistant_message_id: "assistant-1",
              assistant_run_id: "run-1",
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
          values: expect.objectContaining({
            contentMarkdown: "最终回答",
          }),
        }),
        expect.objectContaining({
          table: mocks.tables.messages,
          values: expect.objectContaining({
            contentMarkdown: "最终回答",
            status: MESSAGE_STATUS.COMPLETED,
            structuredJson: expect.objectContaining({
              run_id: "run-1",
              phase: null,
              status_text: null,
            }),
          }),
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
    expect(mocks.appendConversationStreamEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantMessageId: "assistant-1",
        runId: "run-1",
        event: expect.objectContaining({
          type: "answer_delta",
          content_markdown: "",
          delta_text: "第一段",
        }),
      }),
    );
  });

  it("passes ready local-knowledge availability into the agent input", async () => {
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
        structuredJson: {
          run_id: "run-1",
          run_started_at: "2026-03-31T10:00:00.000Z",
          run_last_heartbeat_at: "2026-03-31T10:00:00.000Z",
          run_lease_expires_at: "2026-03-31T10:00:45.000Z",
        },
      },
    ];
    mocks.summarizeWorkspaceSearchableKnowledge.mockResolvedValue({
      hasReadySearchableKnowledge: true,
      totalReadyDocumentCount: 5,
      readyPrivateDocumentCount: 3,
      readyGlobalDocumentCount: 2,
      searchableGlobalLibraryCount: 1,
    });
    mocks.runAgentResponse.mockResolvedValue({
      citations: [],
      ok: true as const,
      sessionId: "session-1",
      text: "最终回答",
      workdir: "/tmp/agent-session",
    });

    await processConversationResponseJob({
      assistantMessageId: "assistant-1",
      conversationId: "conversation-1",
      runId: "run-1",
      prompt: "总结一下",
      userMessageId: "user-1",
    });

    expect(mocks.summarizeWorkspaceSearchableKnowledge).toHaveBeenCalledWith(
      "workspace-1",
      mocks.db,
    );
    expect(mocks.resolveDefaultUsableModelProfile).toHaveBeenCalledWith(mocks.db);
    expect(mocks.resolveUsableModelProfileById).not.toHaveBeenCalled();
    expect(mocks.runAgentResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        modelProfile: expect.objectContaining({
          id: "model-profile-1",
          modelName: "claude-sonnet-4-5",
        }),
        searchableKnowledge: {
          hasReadySearchableKnowledge: true,
          totalReadyDocumentCount: 5,
          readyPrivateDocumentCount: 3,
          readyGlobalDocumentCount: 2,
          searchableGlobalLibraryCount: 1,
        },
      }),
      expect.any(Object),
    );
  });

  it("derives flushed delta text from the persisted snapshot when small chunks are buffered", async () => {
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
        structuredJson: {
          run_id: "run-1",
          run_started_at: "2026-03-31T10:00:00.000Z",
          run_last_heartbeat_at: "2026-03-31T10:00:00.000Z",
          run_lease_expires_at: "2026-03-31T10:00:45.000Z",
        },
      },
    ];

    let now = 1_000;
    const dateNowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);

    mocks.runAgentResponse.mockImplementation(async (_input, hooks) => {
      now = 1_000;
      await hooks?.onAssistantDelta?.({
        textDelta: "第",
        fullText: "第",
      });
      now = 1_050;
      await hooks?.onAssistantDelta?.({
        textDelta: "一",
        fullText: "第一",
      });
      now = 1_100;
      await hooks?.onAssistantDelta?.({
        textDelta: "段",
        fullText: "第一段",
      });
      now = 1_200;
      await hooks?.onAssistantDelta?.({
        textDelta: "。",
        fullText: "第一段。",
      });

      return {
        citations: [],
        ok: true as const,
        sessionId: "session-1",
        text: "最终回答",
        workdir: "/tmp/agent-session",
      };
    });

    try {
      await processConversationResponseJob({
        assistantMessageId: "assistant-1",
        conversationId: "conversation-1",
        runId: "run-1",
        prompt: "总结一下",
        userMessageId: "user-1",
      });
    } finally {
      dateNowSpy.mockRestore();
    }

    expect(readAnswerDeltaEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content_markdown: "",
          delta_text: "第",
        }),
        expect.objectContaining({
          content_markdown: "",
          delta_text: "一段。",
        }),
      ]),
    );
  });

  it("emits normalized inline-citation deltas from the single streamed answer", async () => {
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
        structuredJson: {
          run_id: "run-1",
          run_started_at: "2026-03-31T10:00:00.000Z",
          run_last_heartbeat_at: "2026-03-31T10:00:00.000Z",
          run_lease_expires_at: "2026-03-31T10:00:45.000Z",
        },
      },
    ];
    mocks.runAgentResponse.mockImplementation(async (_input, hooks) => {
      await hooks?.onAssistantDelta?.({
        textDelta: "最终回答",
        fullText: "最终回答",
      });
      await hooks?.onAssistantDelta?.({
        textDelta: "[[cite:1]]",
        fullText: "最终回答[[cite:1]]",
      });

      return {
        citations: [
          {
            citationId: 1,
            evidence: {
              evidence_id: "web:https://example.com/post",
              kind: "web_page",
              url: "https://example.com/post",
              domain: "example.com",
              title: "最新局势说明",
              label: "最新局势说明 · example.com",
              quote_text: "该文称最新变化出现在上周末。",
              source_scope: "web",
              library_title: null,
            },
          },
        ],
        ok: true as const,
        sessionId: "session-1",
        text: "最终回答[[cite:1]]",
        workdir: "/tmp/agent-session",
      };
    });

    await processConversationResponseJob({
      assistantMessageId: "assistant-1",
      conversationId: "conversation-1",
      runId: "run-1",
      prompt: "总结一下",
      userMessageId: "user-1",
    });

    expect(readAnswerDeltaEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content_markdown: "",
          delta_text: "[^1]",
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
        structuredJson: {
          run_id: "run-1",
          run_started_at: "2026-03-31T10:00:00.000Z",
          run_last_heartbeat_at: "2026-03-31T10:00:00.000Z",
          run_lease_expires_at: "2026-03-31T10:00:45.000Z",
        },
      },
    ];
    mocks.runAgentResponse.mockRejectedValue(new Error("queue offline"));

    await processConversationResponseJob({
      assistantMessageId: "assistant-1",
      conversationId: "conversation-1",
      runId: "run-1",
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
            structuredJson: {
              ...buildRunFailedToolMessageState("queue offline").structuredJson,
              assistant_message_id: "assistant-1",
              assistant_run_id: "run-1",
            },
          },
        },
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
              run_id: "run-1",
            }),
          }),
        }),
      ]),
    );
  });

  it("persists external web citations without requiring internal anchors", async () => {
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
        structuredJson: {
          run_id: "run-1",
          run_started_at: "2026-03-31T10:00:00.000Z",
          run_last_heartbeat_at: "2026-03-31T10:00:00.000Z",
          run_lease_expires_at: "2026-03-31T10:00:45.000Z",
        },
      },
    ];
    mocks.insertReturningQueue.push([
      {
        id: "citation-1",
        anchorId: null,
        documentId: null,
        label: "最新局势说明 · example.com",
        quoteText: "该文称最新变化出现在上周末。",
        sourceScope: "web",
        libraryTitle: null,
        sourceUrl: "https://example.com/post",
        sourceDomain: "example.com",
        sourceTitle: "最新局势说明",
      },
    ]);
    mocks.runAgentResponse.mockResolvedValue({
      citations: [
        {
          citationId: 1,
          evidence: {
            evidence_id: "web:https://example.com/post",
            kind: "web_page",
            url: "https://example.com/post",
            domain: "example.com",
            title: "最新局势说明",
            label: "最新局势说明 · example.com",
            quote_text: "该文称最新变化出现在上周末。",
            source_scope: "web",
            library_title: null,
          },
        },
      ],
      ok: true as const,
      sessionId: "session-1",
      text: "最终回答[[cite:1]]",
      workdir: "/tmp/agent-session",
    });

    await processConversationResponseJob({
      assistantMessageId: "assistant-1",
      conversationId: "conversation-1",
      runId: "run-1",
      prompt: "总结一下",
      userMessageId: "user-1",
    });

    expect(mocks.inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: mocks.tables.messageCitations,
          values: expect.arrayContaining([
            expect.objectContaining({
              messageId: "assistant-1",
              anchorId: null,
              documentId: null,
              sourceScope: "web",
              sourceUrl: "https://example.com/post",
              sourceDomain: "example.com",
              sourceTitle: "最新局势说明",
              label: "最新局势说明 · example.com",
              quoteText: "该文称最新变化出现在上周末。",
            }),
          ]),
        }),
      ]),
    );
  });

  it("stops persisting output when the assistant was already finalized elsewhere", async () => {
    mocks.queryResults.conversations = [
      {
        id: "conversation-1",
        workspaceId: "workspace-1",
        agentSessionId: null,
        agentWorkdir: null,
      },
    ];
    mocks.queryResults.messageSequence = [
      [
        {
          id: "assistant-1",
          conversationId: "conversation-1",
          status: MESSAGE_STATUS.STREAMING,
          contentMarkdown: "",
          structuredJson: {
            run_id: "run-1",
            run_started_at: "2026-03-31T10:00:00.000Z",
            run_last_heartbeat_at: "2026-03-31T10:00:00.000Z",
            run_lease_expires_at: "2026-03-31T10:00:45.000Z",
          },
        },
      ],
      [
        {
          id: "assistant-1",
          conversationId: "conversation-1",
          status: MESSAGE_STATUS.STREAMING,
          contentMarkdown: "",
          structuredJson: {
            run_id: "run-1",
            run_started_at: "2026-03-31T10:00:00.000Z",
            run_last_heartbeat_at: "2026-03-31T10:00:00.000Z",
            run_lease_expires_at: "2026-03-31T10:00:45.000Z",
          },
        },
      ],
      [
        {
          id: "assistant-1",
          conversationId: "conversation-1",
          status: MESSAGE_STATUS.COMPLETED,
          contentMarkdown: "手动停止后的内容",
          structuredJson: {
            run_id: "run-1",
            run_started_at: "2026-03-31T10:00:00.000Z",
            run_last_heartbeat_at: "2026-03-31T10:00:00.000Z",
            run_lease_expires_at: "2026-03-31T10:00:45.000Z",
          },
        },
      ],
    ];
    mocks.runAgentResponse.mockResolvedValue({
      citations: [],
      ok: true as const,
      sessionId: "session-1",
      text: "最终回答",
      workdir: "/tmp/agent-session",
    });

    await processConversationResponseJob({
      assistantMessageId: "assistant-1",
      conversationId: "conversation-1",
      runId: "run-1",
      prompt: "总结一下",
      userMessageId: "user-1",
    });

    expect(mocks.runAgentResponse).toHaveBeenCalledTimes(1);
    expect(mocks.updates).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: mocks.tables.messages,
          values: {
            contentMarkdown: "最终回答",
            status: MESSAGE_STATUS.COMPLETED,
            structuredJson: null,
          },
        }),
        expect.objectContaining({
          table: mocks.tables.messages,
          values: buildAssistantFailedMessageState(expect.anything()),
        }),
      ]),
    );
    expect(mocks.inserts).toEqual([]);
  });

  it("fails the run when the assistant answer references an unknown citation id", async () => {
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
        structuredJson: {
          run_id: "run-1",
          run_started_at: "2026-03-31T10:00:00.000Z",
          run_last_heartbeat_at: "2026-03-31T10:00:00.000Z",
          run_lease_expires_at: "2026-03-31T10:00:45.000Z",
        },
      },
    ];
    mocks.runAgentResponse.mockResolvedValue({
      citations: [],
      ok: true as const,
      sessionId: "session-1",
      text: "最终回答[[cite:9]]",
      workdir: "/tmp/agent-session",
    });

    await processConversationResponseJob({
      assistantMessageId: "assistant-1",
      conversationId: "conversation-1",
      runId: "run-1",
      prompt: "总结一下",
      userMessageId: "user-1",
    });

    expect(mocks.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: mocks.tables.messages,
          values: expect.objectContaining({
            status: MESSAGE_STATUS.FAILED,
            structuredJson: expect.objectContaining({
              agent_error: "Assistant answer referenced unknown citation id 9.",
              run_id: "run-1",
            }),
          }),
        }),
      ]),
    );
    expect(mocks.appendConversationStreamEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantMessageId: "assistant-1",
        runId: "run-1",
        event: expect.objectContaining({
          type: "run_failed",
          error: "Assistant answer referenced unknown citation id 9.",
        }),
      }),
    );
  });
});
