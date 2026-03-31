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
    });

    expect(state.displayName).toBe("项目助手");
    expect(state.username).toBe("assistant");
    expect(state.actions.map((action) => action.key)).toEqual(["account", "logout"]);
    expect(state.accountActions.map((action) => action.key)).toEqual(["account"]);
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
    });

    expect(state.displayName).toBe("founder");
    expect(state.avatarLabel).toBe("F");
    expect(state.actions.map((action) => action.key)).toEqual([
      "account",
      "global-libraries",
      "model-management",
      "system-settings",
      "logout",
    ]);
    expect(state.accountActions.map((action) => action.key)).toEqual(["account"]);
    expect(state.adminActions.map((action) => action.key)).toEqual([
      "global-libraries",
      "model-management",
      "system-settings",
    ]);
    expect(state.logoutAction?.key).toBe("logout");
  });
});

describe("resolveWorkspaceUserAvatarLabel", () => {
  test("keeps multibyte characters intact", () => {
    expect(resolveWorkspaceUserAvatarLabel("陈老师")).toBe("陈");
  });
});
