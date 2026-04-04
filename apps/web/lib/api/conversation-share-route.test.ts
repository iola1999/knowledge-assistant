import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tables = {
    conversationShares: Symbol("conversationShares"),
  };

  const shareRows: Array<Record<string, unknown>> = [];
  const auth = vi.fn();
  const requireOwnedConversation = vi.fn();

  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => shareRows),
        })),
      })),
    })),
  };

  return {
    auth,
    db,
    requireOwnedConversation,
    shareRows,
    tables,
  };
});

vi.mock("@/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/guards/resources", () => ({
  requireOwnedConversation: mocks.requireOwnedConversation,
}));

vi.mock("@anchordesk/db", () => ({
  conversationShares: mocks.tables.conversationShares,
  getDb: () => mocks.db,
}));

let GET!: typeof import("../../app/api/conversations/[conversationId]/share/route").GET;

beforeAll(async () => {
  ({ GET } = await import("../../app/api/conversations/[conversationId]/share/route"));
});

beforeEach(() => {
  mocks.shareRows.length = 0;
  mocks.auth.mockReset();
  mocks.requireOwnedConversation.mockReset();
  delete process.env.APP_URL;
});

describe("GET /api/conversations/[conversationId]/share", () => {
  it("prefers APP_URL over the incoming request origin for active share links", async () => {
    process.env.APP_URL = "https://anchordesk.678234.xyz";
    mocks.auth.mockResolvedValue({
      user: { id: "user-1" },
    });
    mocks.requireOwnedConversation.mockResolvedValue({
      id: "conversation-1",
      workspaceId: "workspace-1",
    });
    mocks.shareRows.push({
      shareToken: "token-123",
      createdAt: new Date("2026-04-05T01:15:00.000Z"),
      updatedAt: new Date("2026-04-05T01:15:00.000Z"),
      revokedAt: null,
    });

    const response = (await GET(
      new Request("http://0.0.0.0:3000/api/conversations/conversation-1/share"),
      {
        params: Promise.resolve({ conversationId: "conversation-1" }),
      },
    ))!;
    const body = (await response.json()) as {
      share: {
        isActive: boolean;
        shareUrl: string | null;
      };
    };

    expect(response.status).toBe(200);
    expect(body.share.isActive).toBe(true);
    expect(body.share.shareUrl).toBe(
      "https://anchordesk.678234.xyz/share/token-123",
    );
  });
});
