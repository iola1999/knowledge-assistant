import { describe, expect, test } from "vitest";

import { buildWorkspaceUserPanelState, resolveWorkspaceUserAvatarLabel } from "./workspace-user-panel";

describe("buildWorkspaceUserPanelState", () => {
  test("prefers session values and hides system settings for non-admin users", () => {
    const state = buildWorkspaceUserPanelState({
      sessionUser: {
        name: "项目助手",
        username: "assistant",
      },
      initialUser: {
        name: "初始名称",
        username: "initial-user",
      },
      canAccessSystemSettings: false,
      accountHref: "/account?returnTo=%2Fworkspaces%2Fworkspace-1",
    });

    expect(state.displayName).toBe("项目助手");
    expect(state.username).toBe("assistant");
    expect(state.actions.map((action) => action.key)).toEqual(["account", "logout"]);
    expect(state.accountActions.map((action) => action.key)).toEqual(["account"]);
    expect(state.accountActions[0]).toMatchObject({
      href: "/account?returnTo=%2Fworkspaces%2Fworkspace-1",
    });
    expect(state.adminActions).toEqual([]);
    expect(state.logoutAction?.key).toBe("logout");
  });

  test("falls back to the initial username and keeps the admin-only action", () => {
    const state = buildWorkspaceUserPanelState({
      sessionUser: {
        name: "   ",
        username: "",
      },
      initialUser: {
        name: null,
        username: "founder",
      },
      canAccessSystemSettings: true,
      accountHref: "/account?returnTo=%2Fworkspaces%2Fworkspace-1%3FconversationId%3Dconversation-1",
      systemManagementHref: "/admin/models?returnTo=%2Fworkspaces%2Fworkspace-1",
    });

    expect(state.displayName).toBe("founder");
    expect(state.avatarLabel).toBe("F");
    expect(state.actions.map((action) => action.key)).toEqual([
      "account",
      "system-management",
      "logout",
    ]);
    expect(state.accountActions.map((action) => action.key)).toEqual(["account"]);
    expect(state.accountActions[0]).toMatchObject({
      href: "/account?returnTo=%2Fworkspaces%2Fworkspace-1%3FconversationId%3Dconversation-1",
    });
    expect(state.adminActions.map((action) => action.key)).toEqual(["system-management"]);
    expect(state.adminActions[0]).toMatchObject({
      href: "/admin/models?returnTo=%2Fworkspaces%2Fworkspace-1",
      label: "系统管理",
    });
    expect(state.logoutAction?.key).toBe("logout");
  });
});

describe("resolveWorkspaceUserAvatarLabel", () => {
  test("keeps multibyte characters intact", () => {
    expect(resolveWorkspaceUserAvatarLabel("陈老师")).toBe("陈");
  });
});
