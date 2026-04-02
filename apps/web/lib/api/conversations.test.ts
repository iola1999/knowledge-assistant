import { describe, expect, test } from "vitest";
import { CONVERSATION_STATUS } from "@anchordesk/contracts";

import {
  applyConversationRespondingState,
  applySubmittedConversationToList,
  applySubmittedTurnToConversationMeta,
  appendCurrentConversationBreadcrumb,
  buildConversationTitleFromPrompt,
  chooseWorkspaceConversation,
  chooseWorkspaceConversationWithMeta,
  formatConversationMetaTimestamp,
  formatConversationSidebarUpdatedAt,
  groupWorkspaceConversations,
  markConversationActivityInList,
  markConversationMetaActivity,
  normalizeConversationTitle,
  resolveActiveConversationDisplay,
  resolveConversationDeleteRedirect,
} from "./conversations";

describe("conversation helpers", () => {
  test("builds the first-turn conversation title from the submitted prompt", () => {
    expect(buildConversationTitleFromPrompt("  请总结新版发布流程的关键变化  ")).toBe(
      "请总结新版发布流程的关键变化",
    );
    expect(
      buildConversationTitleFromPrompt(
        "这是一个明显超过四十个字符的长问题，需要在侧栏标题里被截断显示，并且继续补充更多描述避免过短",
      ),
    ).toBe("这是一个明显超过四十个字符的长问题，需要在侧栏标题里被截断显示，并且继续补充更多...");
  });

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
        new Date(2026, 2, 29, 11, 55),
        new Date(2026, 2, 29, 12, 0),
      ),
    ).toBe("5分钟前");
  });

  test("formats recent sidebar activity in relative days", () => {
    expect(
      formatConversationSidebarUpdatedAt(
        new Date(2026, 2, 26, 12, 0),
        new Date(2026, 2, 29, 12, 0),
      ),
    ).toBe("3天前");
  });

  test("formats older sidebar activity as month and day", () => {
    expect(
      formatConversationSidebarUpdatedAt(
        new Date(2026, 2, 12, 12, 0),
        new Date(2026, 2, 29, 12, 0),
      ),
    ).toBe("3月12日");
  });

  test("formats cross-year sidebar activity with the year", () => {
    expect(
      formatConversationSidebarUpdatedAt(
        new Date(2025, 11, 31, 12, 0),
        new Date(2026, 2, 29, 12, 0),
      ),
    ).toBe("2025年12月31日");
  });

  test("formats same-day conversation metadata with today and time", () => {
    expect(
      formatConversationMetaTimestamp(
        new Date(2026, 2, 29, 14, 5),
        new Date(2026, 2, 29, 20, 0),
      ),
    ).toBe("今天 14:05");
  });

  test("formats previous-day conversation metadata with yesterday and time", () => {
    expect(
      formatConversationMetaTimestamp(
        new Date(2026, 2, 28, 23, 15),
        new Date(2026, 2, 29, 9, 0),
      ),
    ).toBe("昨天 23:15");
  });

  test("formats cross-year conversation metadata with full date and time", () => {
    expect(
      formatConversationMetaTimestamp(
        new Date(2025, 11, 31, 8, 30),
        new Date(2026, 2, 29, 9, 0),
      ),
    ).toBe("2025年12月31日 08:30");
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

  test("appends the current conversation as the last chat breadcrumb", () => {
    expect(
      appendCurrentConversationBreadcrumb({
        breadcrumbs: [
          { label: "空间", href: "/workspaces" },
          { label: "旧村改造" },
        ],
        currentConversationTitle: "看下这篇链接的内容是啥",
      }),
    ).toEqual([
      { label: "空间", href: "/workspaces" },
      { label: "旧村改造" },
      { label: "看下这篇链接的内容是啥" },
    ]);
  });

  test("keeps the base breadcrumbs when there is no active conversation title", () => {
    expect(
      appendCurrentConversationBreadcrumb({
        breadcrumbs: [
          { label: "空间", href: "/workspaces" },
          { label: "旧村改造" },
        ],
        currentConversationTitle: "   ",
      }),
    ).toEqual([
      { label: "空间", href: "/workspaces" },
      { label: "旧村改造" },
    ]);
  });

  test("bumps an existing conversation to the top after a new submitted turn", () => {
    expect(
      applySubmittedConversationToList({
        conversations: [
          {
            id: "conversation-1",
            title: "较早会话",
            status: CONVERSATION_STATUS.ACTIVE,
            isResponding: false,
            updatedAt: new Date("2026-03-30T10:00:00.000Z"),
          },
          {
            id: "conversation-2",
            title: "当前会话",
            status: CONVERSATION_STATUS.ACTIVE,
            isResponding: false,
            updatedAt: new Date("2026-03-30T09:00:00.000Z"),
          },
        ],
        conversationId: "conversation-2",
        promptContent: "继续补充风险清单",
        now: new Date("2026-03-30T11:00:00.000Z"),
      }).map((item) => ({
        ...item,
        updatedAt: item.updatedAt.toISOString(),
      })),
    ).toEqual([
      {
        id: "conversation-2",
        title: "当前会话",
        status: CONVERSATION_STATUS.ACTIVE,
        isResponding: true,
        updatedAt: "2026-03-30T11:00:00.000Z",
      },
      {
        id: "conversation-1",
        title: "较早会话",
        status: CONVERSATION_STATUS.ACTIVE,
        isResponding: false,
        updatedAt: "2026-03-30T10:00:00.000Z",
      },
    ]);
  });

  test("inserts a newly created conversation with the first prompt title", () => {
    expect(
      applySubmittedConversationToList({
        conversations: [
          {
            id: "conversation-1",
            title: "已有会话",
            status: CONVERSATION_STATUS.ACTIVE,
            isResponding: false,
            updatedAt: new Date("2026-03-30T10:00:00.000Z"),
          },
        ],
        conversationId: "conversation-2",
        promptContent: "请总结新版发布流程的关键变化",
        now: new Date("2026-03-30T11:00:00.000Z"),
      }).map((item) => ({
        ...item,
        updatedAt: item.updatedAt.toISOString(),
      })),
    ).toEqual([
      {
        id: "conversation-2",
        title: "请总结新版发布流程的关键变化",
        status: CONVERSATION_STATUS.ACTIVE,
        isResponding: true,
        updatedAt: "2026-03-30T11:00:00.000Z",
      },
      {
        id: "conversation-1",
        title: "已有会话",
        status: CONVERSATION_STATUS.ACTIVE,
        isResponding: false,
        updatedAt: "2026-03-30T10:00:00.000Z",
      },
    ]);
  });

  test("updates active conversation meta after a submitted turn on an existing conversation", () => {
    expect(
      applySubmittedTurnToConversationMeta({
        current: {
          id: "conversation-1",
          title: "当前会话",
          status: CONVERSATION_STATUS.ACTIVE,
          isResponding: false,
          createdAt: new Date("2026-03-30T09:00:00.000Z"),
          updatedAt: new Date("2026-03-30T10:00:00.000Z"),
          messageCount: 4,
          attachmentCount: 1,
        },
        conversationId: "conversation-1",
        promptContent: "继续补充风险清单",
        attachmentCount: 1,
        now: new Date("2026-03-30T11:00:00.000Z"),
      }),
    ).toEqual({
      id: "conversation-1",
      title: "当前会话",
      status: CONVERSATION_STATUS.ACTIVE,
      isResponding: true,
      createdAt: new Date("2026-03-30T09:00:00.000Z"),
      updatedAt: new Date("2026-03-30T11:00:00.000Z"),
      messageCount: 6,
      attachmentCount: 1,
    });
  });

  test("builds active conversation meta for a newly created conversation after the first turn", () => {
    expect(
      applySubmittedTurnToConversationMeta({
        current: null,
        conversationId: "conversation-2",
        promptContent: "请总结新版发布流程的关键变化",
        attachmentCount: 2,
        now: new Date("2026-03-30T11:00:00.000Z"),
      }),
    ).toEqual({
      id: "conversation-2",
      title: "请总结新版发布流程的关键变化",
      status: CONVERSATION_STATUS.ACTIVE,
      isResponding: true,
      createdAt: new Date("2026-03-30T11:00:00.000Z"),
      updatedAt: new Date("2026-03-30T11:00:00.000Z"),
      messageCount: 2,
      attachmentCount: 2,
    });
  });

  test("bumps the terminally updated conversation to the top without changing its title", () => {
    expect(
      markConversationActivityInList({
        conversations: [
          {
            id: "conversation-1",
            title: "较新会话",
            status: CONVERSATION_STATUS.ACTIVE,
            isResponding: false,
            updatedAt: new Date("2026-03-30T10:30:00.000Z"),
          },
          {
            id: "conversation-2",
            title: "当前会话",
            status: CONVERSATION_STATUS.ACTIVE,
            isResponding: true,
            updatedAt: new Date("2026-03-30T10:00:00.000Z"),
          },
        ],
        conversationId: "conversation-2",
        now: new Date("2026-03-30T11:00:00.000Z"),
      }).map((item) => ({
        ...item,
        updatedAt: item.updatedAt.toISOString(),
      })),
    ).toEqual([
      {
        id: "conversation-2",
        title: "当前会话",
        status: CONVERSATION_STATUS.ACTIVE,
        isResponding: false,
        updatedAt: "2026-03-30T11:00:00.000Z",
      },
      {
        id: "conversation-1",
        title: "较新会话",
        status: CONVERSATION_STATUS.ACTIVE,
        isResponding: false,
        updatedAt: "2026-03-30T10:30:00.000Z",
      },
    ]);
  });

  test("updates only the active conversation meta timestamp after a terminal event", () => {
    expect(
      markConversationMetaActivity({
        current: {
          id: "conversation-2",
          title: "当前会话",
          status: CONVERSATION_STATUS.ACTIVE,
          isResponding: true,
          createdAt: new Date("2026-03-30T09:00:00.000Z"),
          updatedAt: new Date("2026-03-30T10:00:00.000Z"),
          messageCount: 6,
          attachmentCount: 2,
        },
        conversationId: "conversation-2",
        now: new Date("2026-03-30T11:00:00.000Z"),
      }),
    ).toEqual({
      id: "conversation-2",
      title: "当前会话",
      status: CONVERSATION_STATUS.ACTIVE,
      isResponding: false,
      createdAt: new Date("2026-03-30T09:00:00.000Z"),
      updatedAt: new Date("2026-03-30T11:00:00.000Z"),
      messageCount: 6,
      attachmentCount: 2,
    });
  });

  test("leaves unrelated conversation meta unchanged on a terminal event", () => {
    const current = {
      id: "conversation-1",
      title: "其他会话",
      status: CONVERSATION_STATUS.ACTIVE,
      isResponding: false,
      createdAt: new Date("2026-03-30T09:00:00.000Z"),
      updatedAt: new Date("2026-03-30T10:00:00.000Z"),
      messageCount: 4,
      attachmentCount: 1,
    };

    expect(
      markConversationMetaActivity({
        current,
        conversationId: "conversation-2",
        now: new Date("2026-03-30T11:00:00.000Z"),
      }),
    ).toBe(current);
  });

  test("resolves the active conversation display from live list data and current meta", () => {
    expect(
      resolveActiveConversationDisplay({
        activeConversationId: "conversation-2",
        conversations: [
          {
            id: "conversation-1",
            title: "其他会话",
            status: CONVERSATION_STATUS.ACTIVE,
            isResponding: false,
            updatedAt: new Date("2026-03-30T10:00:00.000Z"),
          },
          {
            id: "conversation-2",
            title: "新的会话标题",
            status: CONVERSATION_STATUS.ARCHIVED,
            isResponding: true,
            updatedAt: new Date("2026-03-30T11:00:00.000Z"),
          },
        ],
        current: {
          id: "conversation-2",
          title: "旧的会话标题",
          status: CONVERSATION_STATUS.ACTIVE,
          isResponding: false,
          createdAt: new Date("2026-03-30T09:00:00.000Z"),
          updatedAt: new Date("2026-03-30T10:30:00.000Z"),
          messageCount: 6,
          attachmentCount: 2,
        },
      }),
    ).toEqual({
      id: "conversation-2",
      title: "新的会话标题",
      status: CONVERSATION_STATUS.ARCHIVED,
      isResponding: true,
      createdAt: new Date("2026-03-30T09:00:00.000Z"),
      updatedAt: new Date("2026-03-30T11:00:00.000Z"),
      messageCount: 6,
      attachmentCount: 2,
    });
  });

  test("returns null when the current meta does not belong to the active conversation", () => {
    expect(
      resolveActiveConversationDisplay({
        activeConversationId: "conversation-2",
        conversations: [
          {
            id: "conversation-2",
            title: "当前会话",
            status: CONVERSATION_STATUS.ACTIVE,
            isResponding: false,
            updatedAt: new Date("2026-03-30T11:00:00.000Z"),
          },
        ],
        current: {
          id: "conversation-1",
          title: "其他会话",
          status: CONVERSATION_STATUS.ACTIVE,
          isResponding: false,
          createdAt: new Date("2026-03-30T09:00:00.000Z"),
          updatedAt: new Date("2026-03-30T10:30:00.000Z"),
          messageCount: 6,
          attachmentCount: 2,
        },
      }),
    ).toBeNull();
  });

  test("applies responding state from a streaming conversation id set", () => {
    expect(
      applyConversationRespondingState({
        conversations: [
          {
            id: "conversation-1",
            title: "已完成会话",
            status: CONVERSATION_STATUS.ACTIVE,
            updatedAt: new Date("2026-03-30T10:00:00.000Z"),
          },
          {
            id: "conversation-2",
            title: "正在生成",
            status: CONVERSATION_STATUS.ACTIVE,
            updatedAt: new Date("2026-03-30T11:00:00.000Z"),
          },
        ],
        respondingConversationIds: new Set(["conversation-2"]),
      }).map((item) => ({
        id: item.id,
        isResponding: item.isResponding,
      })),
    ).toEqual([
      {
        id: "conversation-1",
        isResponding: false,
      },
      {
        id: "conversation-2",
        isResponding: true,
      },
    ]);
  });
});
