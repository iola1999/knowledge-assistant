import { describe, expect, test } from "vitest";

import {
  buildAccountSettingsNavGroups,
  resolveDefaultAccountSettingsSectionId,
} from "./account-settings";

describe("buildAccountSettingsNavGroups", () => {
  test("returns the ordinary-user account settings groups in display order", () => {
    const groups = buildAccountSettingsNavGroups();

    expect(groups.map((group) => group.label)).toEqual(["账户", "安全", "会话"]);
    expect(groups.flatMap((group) => group.items.map((item) => item.id))).toEqual([
      "profile",
      "security",
      "session",
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
