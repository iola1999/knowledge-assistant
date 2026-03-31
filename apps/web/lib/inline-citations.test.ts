import { describe, expect, test } from "vitest";

import { parseInlineCitationIndices, renderInlineCitationMarkers } from "./inline-citations";

describe("renderInlineCitationMarkers", () => {
  test("converts adjacent inline citation markers into a grouped custom tag", () => {
    expect(renderInlineCitationMarkers("结论[^1][^2]")).toBe(
      '结论<citation-group data-citation-indices="1,2"></citation-group>',
    );
  });
});

describe("parseInlineCitationIndices", () => {
  test("reads grouped citation indices from a custom tag payload", () => {
    expect(parseInlineCitationIndices("1,2,7")).toEqual([1, 2, 7]);
  });
});
