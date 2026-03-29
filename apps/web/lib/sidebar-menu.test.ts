import { describe, expect, test } from "vitest";

import { resolveSidebarConversationMenuPosition } from "./sidebar-menu";

describe("sidebar menu helpers", () => {
  test("positions the menu to the right of the trigger by default", () => {
    expect(
      resolveSidebarConversationMenuPosition({
        triggerRect: {
          top: 180,
          right: 420,
          height: 32,
        },
        menuWidth: 156,
        menuHeight: 72,
        viewportWidth: 1280,
        viewportHeight: 900,
      }),
    ).toEqual({
      left: 432,
      top: 160,
    });
  });

  test("keeps the menu within the viewport when near the screen edge", () => {
    expect(
      resolveSidebarConversationMenuPosition({
        triggerRect: {
          top: 8,
          right: 1180,
          height: 32,
        },
        menuWidth: 156,
        menuHeight: 72,
        viewportWidth: 1280,
        viewportHeight: 100,
      }),
    ).toEqual({
      left: 1112,
      top: 12,
    });
  });
});
