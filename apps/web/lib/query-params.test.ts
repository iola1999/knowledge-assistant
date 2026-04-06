import { describe, expect, test } from "vitest";

import { normalizeOptionalStringParam } from "./query-params";

describe("normalizeOptionalStringParam", () => {
  test("returns undefined for empty inputs", () => {
    expect(normalizeOptionalStringParam(undefined)).toBeUndefined();
    expect(normalizeOptionalStringParam("")).toBeUndefined();
    expect(normalizeOptionalStringParam("   ")).toBeUndefined();
  });

  test("keeps a trimmed string", () => {
    expect(normalizeOptionalStringParam(" /docs ")).toBe("/docs");
  });

  test("picks the first entry for string arrays", () => {
    expect(normalizeOptionalStringParam(["/a", "/b"])).toBe("/a");
  });

  test("skips empty values in string arrays", () => {
    expect(normalizeOptionalStringParam(["", " /a "])).toBe("/a");
  });
});
