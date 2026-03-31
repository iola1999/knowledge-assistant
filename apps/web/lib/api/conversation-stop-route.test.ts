import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MESSAGE_ROLE, MESSAGE_STATUS } from "@anchordesk/contracts";

const mocks = vi.hoisted(() => {
  const tables = {
    conversations: Symbol("conversations"),
    messages: Symbol("messages"),
  };

  const latestStreamingAssistants: Array<Record<string, unknown>> = [];
  const updates: Array<{ table: unknown; values: unknown }> = [];
  const updateReturningQueue: unknown[][] = [];

  const auth = vi.fn();
  const requireOwnedConversation = vi.fn();
  const loggerChild = {
    info: vi.fn(),
    warn: vi.fn(),
  };

  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => latestStreamingAssistants),
          })),
        })),
      })),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: unknown) => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => {
            updates.push({ table, values });
            return updateReturningQueue.shift() ?? [];
          }),
        })),
      })),
    })),
  };

  return {
    auth,
    db,
    latestStreamingAssistants,
    loggerChild,
    requireOwnedConversation,
    tables,
    updates,
    updateReturningQueue,
  };
});

vi.mock("@/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/guards/resources", () => ({
  requireOwnedConversation: mocks.requireOwnedConversation,
}));

vi.mock("@/lib/server/logger", () => ({
  buildRequestLogContext: () => ({}),
  logger: {
    child: () => mocks.loggerChild,
  },
  resolveRequestId: () => "request-1",
}));

vi.mock("@anchordesk/db", () => ({
  conversations: mocks.tables.conversations,
  getDb: () => mocks.db,
  messages: mocks.tables.messages,
}));

let POST: typeof import("../../app/api/conversations/[conversationId]/stop/route").POST;

beforeAll(async () => {
  ({ POST } = await import("../../app/api/conversations/[conversationId]/stop/route"));
});

beforeEach(() => {
  mocks.latestStreamingAssistants.length = 0;
  mocks.updateReturningQueue.length = 0;
  mocks.updates.length = 0;
  mocks.auth.mockReset();
  mocks.requireOwnedConversation.mockReset();
  mocks.loggerChild.info.mockReset();
  mocks.loggerChild.warn.mockReset();
});

describe("POST /api/conversations/[conversationId]/stop", () => {
  it("stops the latest streaming assistant and returns the finalized message", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "user-1" },
    });
    mocks.requireOwnedConversation.mockResolvedValue({
      id: "conversation-1",
      workspaceId: "workspace-1",
    });
    mocks.latestStreamingAssistants.push({
      id: "assistant-1",
      contentMarkdown: "已经生成的前半段",
      structuredJson: {
        run_id: "run-1",
        run_started_at: "2026-03-31T10:00:00.000Z",
        run_last_heartbeat_at: "2026-03-31T10:00:10.000Z",
        run_lease_expires_at: "2026-03-31T10:00:55.000Z",
        phase: "drafting",
        status_text: "助手正在生成回答草稿...",
        stream_event_id: "1743328800000-0",
        active_tool_name: null,
        active_tool_use_id: null,
        active_task_id: null,
      },
    });
    mocks.updateReturningQueue.push(
      [
        {
          id: "assistant-1",
          role: MESSAGE_ROLE.ASSISTANT,
          status: MESSAGE_STATUS.COMPLETED,
          contentMarkdown: "已经生成的前半段",
          structuredJson: {
            run_id: "run-1",
          },
        },
      ],
      [],
    );

    const response = await POST(
      new Request("http://localhost/api/conversations/conversation-1/stop", {
        method: "POST",
      }),
      {
        params: Promise.resolve({ conversationId: "conversation-1" }),
      },
    );
    const body = (await response.json()) as {
      assistantMessage: {
        id: string;
        status: string;
        contentMarkdown: string;
      };
    };

    expect(response.status).toBe(200);
    expect(body.assistantMessage).toMatchObject({
      id: "assistant-1",
      status: MESSAGE_STATUS.COMPLETED,
      contentMarkdown: "已经生成的前半段",
    });
    expect(mocks.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: mocks.tables.messages,
          values: expect.objectContaining({
            contentMarkdown: "已经生成的前半段",
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
            updatedAt: expect.any(Date),
          }),
        }),
      ]),
    );
  });

  it("returns 400 when the conversation has no active streaming assistant", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "user-1" },
    });
    mocks.requireOwnedConversation.mockResolvedValue({
      id: "conversation-1",
      workspaceId: "workspace-1",
    });

    const response = await POST(
      new Request("http://localhost/api/conversations/conversation-1/stop", {
        method: "POST",
      }),
      {
        params: Promise.resolve({ conversationId: "conversation-1" }),
      },
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("当前没有正在生成的回答。");
  });
});
