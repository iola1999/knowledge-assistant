import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildAssistantFailedMessageState,
  buildRunFailedToolMessageState,
  MESSAGE_STATUS,
} from "@anchordesk/contracts";

const mocks = vi.hoisted(() => {
  const tables = {
    messages: Symbol("messages"),
  };

  const queryResults = {
    messages: [] as Array<Record<string, unknown>>,
  };

  const inserts: Array<{ table: unknown; values: unknown }> = [];
  const insertReturningQueue: Array<Array<Record<string, unknown>>> = [];
  const updates: Array<{ table: unknown; values: unknown }> = [];
  const appendConversationStreamEvent = vi.fn(async () => "1743490000000-0");

  const db = {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => {
            if (table === tables.messages) {
              return queryResults.messages;
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
    appendConversationStreamEvent,
    db,
    inserts,
    insertReturningQueue,
    queryResults,
    tables,
    updates,
  };
});

vi.mock("@anchordesk/db", () => ({
  getDb: () => mocks.db,
  messages: mocks.tables.messages,
}));

vi.mock("@anchordesk/queue", () => ({
  appendConversationStreamEvent: mocks.appendConversationStreamEvent,
}));

let failConversationResponseRun: typeof import("./conversation-run-failure").failConversationResponseRun;

beforeAll(async () => {
  ({ failConversationResponseRun } = await import("./conversation-run-failure"));
});

beforeEach(() => {
  mocks.queryResults.messages = [];
  mocks.inserts.length = 0;
  mocks.insertReturningQueue.length = 0;
  mocks.updates.length = 0;
  mocks.appendConversationStreamEvent.mockReset();
  mocks.appendConversationStreamEvent.mockResolvedValue("1743490000000-0");
});

describe("failConversationResponseRun", () => {
  it("marks a streaming assistant run failed and emits tool/run_failed events", async () => {
    mocks.queryResults.messages = [
      {
        id: "assistant-1",
        status: MESSAGE_STATUS.STREAMING,
        structuredJson: {
          run_id: "run-1",
          run_started_at: "2026-03-31T10:00:00.000Z",
          run_last_heartbeat_at: "2026-03-31T10:00:10.000Z",
          run_lease_expires_at: "2026-03-31T10:00:55.000Z",
        },
      },
    ];
    mocks.insertReturningQueue.push([
      {
        id: "tool-1",
        status: MESSAGE_STATUS.FAILED,
        contentMarkdown: "运行失败：runtime restarting",
        createdAt: new Date("2026-03-31T10:00:20.000Z"),
        structuredJson: {
          timeline_event: "run_failed",
          error: "runtime restarting",
        },
      },
    ]);

    const result = await failConversationResponseRun({
      conversationId: "conversation-1",
      assistantMessageId: "assistant-1",
      runId: "run-1",
      error: "runtime restarting",
    });

    expect(result).toEqual({
      applied: true,
      errorMessage: "runtime restarting",
    });
    expect(mocks.inserts).toEqual([
      {
        table: mocks.tables.messages,
        values: {
          conversationId: "conversation-1",
          role: "tool",
          ...buildRunFailedToolMessageState("runtime restarting"),
          structuredJson: {
            ...buildRunFailedToolMessageState("runtime restarting").structuredJson,
            assistant_message_id: "assistant-1",
            assistant_run_id: "run-1",
          },
        },
      },
    ]);
    expect(mocks.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: mocks.tables.messages,
          values: expect.objectContaining({
            ...buildAssistantFailedMessageState("runtime restarting"),
            structuredJson: expect.objectContaining({
              agent_error: "runtime restarting",
              run_id: "run-1",
            }),
          }),
        }),
        expect.objectContaining({
          table: mocks.tables.messages,
          values: expect.objectContaining({
            structuredJson: expect.objectContaining({
              agent_error: "runtime restarting",
              run_id: "run-1",
              stream_event_id: "1743490000000-0",
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
          type: "tool_message",
          message_id: "tool-1",
        }),
      }),
    );
    expect(mocks.appendConversationStreamEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantMessageId: "assistant-1",
        runId: "run-1",
        event: expect.objectContaining({
          type: "run_failed",
          error: "runtime restarting",
        }),
      }),
    );
  });

  it("does nothing when the assistant run is no longer streaming", async () => {
    mocks.queryResults.messages = [
      {
        id: "assistant-1",
        status: MESSAGE_STATUS.COMPLETED,
        structuredJson: {
          run_id: "run-1",
        },
      },
    ];

    const result = await failConversationResponseRun({
      conversationId: "conversation-1",
      assistantMessageId: "assistant-1",
      runId: "run-1",
      error: "runtime restarting",
    });

    expect(result).toEqual({
      applied: false,
      errorMessage: null,
    });
    expect(mocks.inserts).toEqual([]);
    expect(mocks.updates).toEqual([]);
    expect(mocks.appendConversationStreamEvent).not.toHaveBeenCalled();
  });
});
