import { describe, expect, test } from "vitest";

import {
  buildAccountSettingsHref,
  buildAccountSettingsReturnTo,
  buildAccountSettingsNavGroups,
  resolveAccountSettingsReturnHref,
  resolveDefaultAccountSettingsSectionId,
} from "./account-settings";

describe("buildAccountSettingsNavGroups", () => {
  test("returns the ordinary-user account settings groups in display order", () => {
    const groups = buildAccountSettingsNavGroups();

    expect(groups.map((group) => group.label)).toEqual(["账户", "安全"]);
    expect(groups.flatMap((group) => group.items.map((item) => item.id))).toEqual([
      "profile",
      "security",
    ]);
  });
});

describe("resolveDefaultAccountSettingsSectionId", () => {
  test("returns the first settings section when groups exist", () => {
    expect(
      resolveDefaultAccountSettingsSectionId(buildAccountSettingsNavGroups()),
    ).toBe("profile");
  });

  test("falls back to profile when groups are empty", () => {
    expect(resolveDefaultAccountSettingsSectionId([])).toBe("profile");
  });
});

describe("buildAccountSettingsHref", () => {
  test("adds a validated return target when present", () => {
    expect(
      buildAccountSettingsHref({
        returnTo: "/workspaces/workspace-1?conversationId=conversation-1",
      }),
    ).toBe(
      "/account?returnTo=%2Fworkspaces%2Fworkspace-1%3FconversationId%3Dconversation-1",
    );
  });

  test("drops invalid return targets", () => {
    expect(
      buildAccountSettingsHref({
        returnTo: "https://example.com",
      }),
    ).toBe("/account");
  });
});

describe("resolveAccountSettingsReturnHref", () => {
  test("returns a validated internal page target", () => {
    expect(
      resolveAccountSettingsReturnHref("/workspaces/workspace-1?conversationId=conversation-1"),
    ).toBe("/workspaces/workspace-1?conversationId=conversation-1");
  });

  test("falls back to workspaces for invalid targets", () => {
    expect(resolveAccountSettingsReturnHref("javascript:alert(1)")).toBe("/workspaces");
    expect(resolveAccountSettingsReturnHref("/account")).toBe("/workspaces");
  });
});

describe("buildAccountSettingsReturnTo", () => {
  test("preserves the current path and search string", () => {
    const searchParams = new URLSearchParams({
      conversationId: "conversation-1",
    });

    expect(
      buildAccountSettingsReturnTo("/workspaces/workspace-1", searchParams),
    ).toBe("/workspaces/workspace-1?conversationId=conversation-1");
  });

  test("returns null for the account page itself", () => {
    expect(buildAccountSettingsReturnTo("/account")).toBeNull();
  });
});
