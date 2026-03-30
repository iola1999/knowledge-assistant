import { describe, expect, it } from "vitest";

import {
  buildDisplayInlineCitationToken,
  buildRawInlineCitationToken,
  extractDisplayInlineCitationOrdinals,
  extractRawInlineCitationSlots,
  replaceDisplayInlineCitationTokens,
  replaceRawInlineCitationTokens,
} from "./citation-markers";

describe("citation marker helpers", () => {
  it("builds raw and display citation tokens", () => {
    expect(buildRawInlineCitationToken(3)).toBe("[[cite:3]]");
    expect(buildDisplayInlineCitationToken(2)).toBe("[^2]");
  });

  it("extracts raw prompt slots and display ordinals in order", () => {
    expect(
      extractRawInlineCitationSlots("结论[[cite:2]][[cite:1]]，补充[[cite:2]]"),
    ).toEqual([2, 1, 2]);
    expect(extractDisplayInlineCitationOrdinals("结论[^2][^1]，补充[^2]")).toEqual([
      2,
      1,
      2,
    ]);
  });

  it("replaces raw and display tokens deterministically", () => {
    expect(
      replaceRawInlineCitationTokens("结论[[cite:2]][[cite:9]]", (slot) =>
        slot === 2 ? "[^1]" : "",
      ),
    ).toBe("结论[^1]");
    expect(
      replaceDisplayInlineCitationTokens("结论[^1][^2]", (index) =>
        `<c data-i="${index}"></c>`,
      ),
    ).toBe('结论<c data-i="1"></c><c data-i="2"></c>');
  });
});
