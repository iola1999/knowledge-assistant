import { describe, expect, it } from "vitest";

import { workspaceBranding } from "./branding";

describe("workspaceBranding", () => {
  it("uses the generic knowledge assistant brand", () => {
    expect(workspaceBranding).toEqual({
      badgeLabel: "KA",
      productName: "Knowledge Assistant",
      productTagline: "Workspace Knowledge Base",
    });
  });
});

