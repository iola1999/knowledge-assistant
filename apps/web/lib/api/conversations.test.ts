import { describe, expect, test } from "vitest";
import { CONVERSATION_STATUS } from "@knowledge-assistant/contracts";

import {
  chooseWorkspaceConversation,
  chooseWorkspaceConversationWithMeta,
  formatConversationSidebarUpdatedAt,
  groupWorkspaceConversations,
  normalizeConversationTitle,
  resolveConversationDeleteRedirect,
} from "./conversations";

describe("conversation helpers", () => {
  test("normalizes conversation titles and falls back when empty", () => {
    expect(normalizeConversationTitle("  发布方案讨论  ", "默认会话")).toBe(
      "发布方案讨论",
    );
    expect(normalizeConversationTitle("   ", "默认会话")).toBe("默认会话");
  });

  test("chooses the requested conversation when it exists", () => {
    const selected = chooseWorkspaceConversation(
      [
        {
          id: "active-2",
          title: "第二个会话",
          status: CONVERSATION_STATUS.ACTIVE,
          updatedAt: new Date("2026-03-28T10:00:00Z"),
        },
        {
          id: "archived-1",
          title: "已归档会话",
          status: CONVERSATION_STATUS.ARCHIVED,
          updatedAt: new Date("2026-03-28T11:00:00Z"),
        },
      ],
      "archived-1",
    );

    expect(selected?.id).toBe("archived-1");
  });

  test("returns null when no conversation is explicitly requested", () => {
    const selected = chooseWorkspaceConversation([
      {
        id: "active-older",
        title: "较早",
        status: CONVERSATION_STATUS.ACTIVE,
        updatedAt: new Date("2026-03-28T09:00:00Z"),
      },
      {
        id: "archived-newer",
        title: "已归档",
        status: CONVERSATION_STATUS.ARCHIVED,
        updatedAt: new Date("2026-03-28T12:00:00Z"),
      },
      {
        id: "active-newer",
        title: "较新",
        status: CONVERSATION_STATUS.ACTIVE,
        updatedAt: new Date("2026-03-28T11:00:00Z"),
      },
    ]);

    expect(selected).toBeNull();
  });

  test("returns null when the requested conversation does not exist", () => {
    const selected = chooseWorkspaceConversation(
      [
        {
          id: "active-older",
          title: "较早",
          status: CONVERSATION_STATUS.ACTIVE,
          updatedAt: new Date("2026-03-28T09:00:00Z"),
        },
      ],
      "missing",
    );

    expect(selected).toBeNull();
  });

  test("keeps the workspace page in empty state when no conversation id is requested", () => {
    const selected = chooseWorkspaceConversationWithMeta([
      {
        id: "active-older",
        title: "较早",
        status: CONVERSATION_STATUS.ACTIVE,
        updatedAt: new Date("2026-03-28T09:00:00Z"),
        createdAt: new Date("2026-03-28T08:00:00Z"),
      },
      {
        id: "active-newer",
        title: "较新",
        status: CONVERSATION_STATUS.ACTIVE,
        updatedAt: new Date("2026-03-28T11:00:00Z"),
        createdAt: new Date("2026-03-28T10:30:00Z"),
      },
    ]);

    expect(selected).toBeNull();
  });

  test("returns null for workspace page meta helper when the requested conversation does not exist", () => {
    const selected = chooseWorkspaceConversationWithMeta(
      [
        {
          id: "active-older",
          title: "较早",
          status: CONVERSATION_STATUS.ACTIVE,
          updatedAt: new Date("2026-03-28T09:00:00Z"),
          createdAt: new Date("2026-03-28T08:00:00Z"),
        },
      ],
      "missing",
    );

    expect(selected).toBeNull();
  });

  test("groups conversations by status while preserving recent-first order", () => {
    const grouped = groupWorkspaceConversations([
      {
        id: "active-1",
        title: "活跃一",
        status: CONVERSATION_STATUS.ACTIVE,
        updatedAt: new Date("2026-03-28T11:00:00Z"),
      },
      {
        id: "archived-1",
        title: "归档一",
        status: CONVERSATION_STATUS.ARCHIVED,
        updatedAt: new Date("2026-03-28T12:00:00Z"),
      },
      {
        id: "active-2",
        title: "活跃二",
        status: CONVERSATION_STATUS.ACTIVE,
        updatedAt: new Date("2026-03-28T10:00:00Z"),
      },
    ]);

    expect(grouped.active.map((item) => item.id)).toEqual(["active-1", "active-2"]);
    expect(grouped.archived.map((item) => item.id)).toEqual(["archived-1"]);
  });

  test("formats recent sidebar activity in relative minutes", () => {
    expect(
      formatConversationSidebarUpdatedAt(
        new Date("2026-03-29T11:55:00Z"),
        new Date("2026-03-29T12:00:00Z"),
      ),
    ).toBe("5分钟前");
  });

  test("formats recent sidebar activity in relative days", () => {
    expect(
      formatConversationSidebarUpdatedAt(
        new Date("2026-03-26T12:00:00Z"),
        new Date("2026-03-29T12:00:00Z"),
      ),
    ).toBe("3天前");
  });

  test("formats older sidebar activity as month and day", () => {
    expect(
      formatConversationSidebarUpdatedAt(
        new Date("2026-03-12T12:00:00Z"),
        new Date("2026-03-29T12:00:00Z"),
      ),
    ).toBe("3月12日");
  });

  test("formats cross-year sidebar activity with the year", () => {
    expect(
      formatConversationSidebarUpdatedAt(
        new Date("2025-12-31T12:00:00Z"),
        new Date("2026-03-29T12:00:00Z"),
      ),
    ).toBe("2025年12月31日");
  });

  test("redirects to workspace root after deleting the active conversation", () => {
    expect(
      resolveConversationDeleteRedirect({
        workspaceId: "workspace-1",
        deletedConversationId: "conversation-2",
        activeConversationId: "conversation-2",
      }),
    ).toBe("/workspaces/workspace-1");
  });

  test("keeps the current page when deleting a different conversation", () => {
    expect(
      resolveConversationDeleteRedirect({
        workspaceId: "workspace-1",
        deletedConversationId: "conversation-3",
        activeConversationId: "conversation-2",
      }),
    ).toBeNull();
  });
});
