import { describe, expect, test } from "vitest";

import { renderInlineCitationMarkers } from "./inline-citations";

describe("renderInlineCitationMarkers", () => {
  test("converts stored inline citation markers into renderable custom tags", () => {
    expect(renderInlineCitationMarkers("结论[^1][^2]")).toBe(
      '结论<citation-marker data-citation-index="1"></citation-marker><citation-marker data-citation-index="2"></citation-marker>',
    );
  });
});
