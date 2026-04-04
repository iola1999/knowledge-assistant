import { describe, expect, test } from "vitest";

import {
  buildConversationSharePath,
  buildConversationShareUrl,
  generateConversationShareToken,
  isConversationShareActive,
  resolveConversationShareOrigin,
} from "./conversation-share";

describe("conversation share helpers", () => {
  test("generates a non-empty share token", () => {
    expect(generateConversationShareToken()).toMatch(/^[A-Za-z0-9_-]{20,}$/);
  });

  test("builds share paths and absolute urls", () => {
    expect(buildConversationSharePath("token-123")).toBe("/share/token-123");
    expect(buildConversationShareUrl("https://example.com/app", "token-123")).toBe(
      "https://example.com/share/token-123",
    );
  });

  test("prefers APP_URL when resolving the share origin", () => {
    const request = new Request("http://0.0.0.0:3000/api/conversations/conversation-1/share");

    expect(
      resolveConversationShareOrigin(request, {
        APP_URL: " https://anchordesk.678234.xyz ",
      }),
    ).toBe("https://anchordesk.678234.xyz");
  });

  test("falls back to the request origin when APP_URL is missing", () => {
    const request = new Request("https://anchordesk.678234.xyz/api/conversations/conversation-1/share");

    expect(resolveConversationShareOrigin(request, {})).toBe(
      "https://anchordesk.678234.xyz",
    );
  });

  test("treats revoked shares as inactive", () => {
    expect(
      isConversationShareActive({
        shareToken: "active-token",
        revokedAt: null,
      }),
    ).toBe(true);

    expect(
      isConversationShareActive({
        shareToken: "revoked-token",
        revokedAt: new Date("2026-03-29T00:00:00Z"),
      }),
    ).toBe(false);
  });
});
