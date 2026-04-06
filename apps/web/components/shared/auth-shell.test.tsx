// @vitest-environment jsdom

import { act } from "react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { AuthShell } from "./auth-shell";

describe("AuthShell", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  test("renders the editorial auth frame with brand and content slots", () => {
    act(() => {
      root.render(createElement(AuthShell, { children: createElement("div", null, "form-slot") }));
    });

    expect(container.textContent).toContain("AnchorDesk");
    expect(container.textContent).toContain("form-slot");
  });
});

