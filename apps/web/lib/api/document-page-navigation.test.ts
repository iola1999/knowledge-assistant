import { describe, expect, test } from "vitest";

import { resolveDocumentPreviewBackTarget } from "./document-page-navigation";

describe("resolveDocumentPreviewBackTarget", () => {
  test("returns the current workspace when a workspace id is present", () => {
    expect(resolveDocumentPreviewBackTarget("workspace-123")).toEqual({
      href: "/workspaces/workspace-123",
      label: "返回工作区",
    });
  });

  test("falls back to the homepage when the workspace id is missing", () => {
    expect(resolveDocumentPreviewBackTarget("")).toEqual({
      href: "/",
      label: "返回首页",
    });
  });
});
