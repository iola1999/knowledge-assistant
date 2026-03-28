import { describe, expect, it } from "vitest";

import {
  isWorkspaceDeleted,
  resolveWorkspaceDeletedAt,
} from "./workspace-lifecycle";

describe("resolveWorkspaceDeletedAt", () => {
  it("uses the current tombstone when the workspace is already soft deleted", () => {
    const currentDeletedAt = new Date("2026-03-29T12:00:00.000Z");

    expect(
      resolveWorkspaceDeletedAt({
        currentDeletedAt,
      }),
    ).toBe(currentDeletedAt);
  });

  it("sets the tombstone timestamp when soft deleting an active workspace", () => {
    const now = new Date("2026-03-29T13:00:00.000Z");

    expect(
      resolveWorkspaceDeletedAt({
        currentDeletedAt: null,
        now,
      }),
    ).toBe(now);
  });
});

describe("isWorkspaceDeleted", () => {
  it("returns true only when deletedAt is a date", () => {
    expect(isWorkspaceDeleted(new Date())).toBe(true);
    expect(isWorkspaceDeleted(null)).toBe(false);
    expect(isWorkspaceDeleted(undefined)).toBe(false);
  });
});
