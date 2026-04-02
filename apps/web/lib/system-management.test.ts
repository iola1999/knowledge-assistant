import { describe, expect, test } from "vitest";

import {
  buildSystemManagementNavItems,
  buildSystemManagementSectionHref,
  resolveSystemManagementReturnHref,
  resolveSystemManagementSection,
  resolveWorkspaceSystemManagementReturnTo,
} from "./system-management";

describe("buildSystemManagementNavItems", () => {
  test("returns the system management modules in display order", () => {
    const items = buildSystemManagementNavItems("models");

    expect(items.map((item) => item.id)).toEqual([
      "models",
      "libraries",
      "settings",
    ]);
    expect(items.map((item) => item.label)).toEqual([
      "模型管理",
      "全局资料库",
      "系统参数",
    ]);
    expect(items.map((item) => item.href)).toEqual([
      "/admin/models",
      "/settings/libraries",
      "/settings",
    ]);
    expect(items.map((item) => item.selected)).toEqual([true, false, false]);
  });

  test("preserves returnTo across system management section switches", () => {
    const items = buildSystemManagementNavItems("libraries", {
      returnTo: "/workspaces/workspace-1",
    });

    expect(items.map((item) => item.href)).toEqual([
      "/admin/models?returnTo=%2Fworkspaces%2Fworkspace-1",
      "/settings/libraries?returnTo=%2Fworkspaces%2Fworkspace-1",
      "/settings?returnTo=%2Fworkspaces%2Fworkspace-1",
    ]);
  });
});

describe("resolveSystemManagementSection", () => {
  test("keeps library detail pages under the libraries section", () => {
    expect(resolveSystemManagementSection("/settings/libraries/library-1")).toBe(
      "libraries",
    );
  });

  test("maps exact section routes to their matching section ids", () => {
    expect(resolveSystemManagementSection("/admin/models")).toBe("models");
    expect(resolveSystemManagementSection("/settings")).toBe("settings");
  });

  test("falls back to models for unknown routes", () => {
    expect(resolveSystemManagementSection("/unknown")).toBe("models");
  });
});

describe("buildSystemManagementSectionHref", () => {
  test("adds a workspace return target when present", () => {
    expect(
      buildSystemManagementSectionHref("models", {
        returnTo: "/workspaces/workspace-1",
      }),
    ).toBe("/admin/models?returnTo=%2Fworkspaces%2Fworkspace-1");
  });

  test("drops invalid return targets", () => {
    expect(
      buildSystemManagementSectionHref("settings", {
        returnTo: "https://example.com/escape",
      }),
    ).toBe("/settings");
  });
});

describe("resolveSystemManagementReturnHref", () => {
  test("returns a validated workspace target", () => {
    expect(resolveSystemManagementReturnHref("/workspaces/workspace-1")).toBe(
      "/workspaces/workspace-1",
    );
  });

  test("falls back to the workspace index for invalid targets", () => {
    expect(resolveSystemManagementReturnHref("javascript:alert(1)")).toBe(
      "/workspaces",
    );
  });
});

describe("resolveWorkspaceSystemManagementReturnTo", () => {
  test("keeps the current workspace root when entering from a workspace subpage", () => {
    expect(
      resolveWorkspaceSystemManagementReturnTo(
        "/workspaces/workspace-1/knowledge-base",
      ),
    ).toBe("/workspaces/workspace-1");
  });

  test("returns null outside concrete workspace pages", () => {
    expect(resolveWorkspaceSystemManagementReturnTo("/workspaces")).toBeNull();
    expect(resolveWorkspaceSystemManagementReturnTo("/admin/models")).toBeNull();
  });
});
