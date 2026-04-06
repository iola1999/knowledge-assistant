// @vitest-environment jsdom

import { act } from "react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { PublicPageShell } from "./public-page-shell";

describe("PublicPageShell", () => {
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

  test("uses the redesigned frosted header + wider reading band (not the legacy chrome combo)", () => {
    act(() => {
      root.render(
        createElement(PublicPageShell, {
          productName: "AnchorDesk",
          pageLabel: "共享会话",
          title: createElement("h1", null, "标题"),
          children: createElement("div", null, "content-slot"),
          footer: createElement("div", null, "footer-slot"),
        }),
      );
    });

    const header = container.querySelector('[data-slot="public-page-shell-header"]');
    expect(header).not.toBeNull();
    const headerClass = header?.getAttribute("class") ?? "";

    expect(headerClass).toContain("sticky");
    expect(headerClass).toContain("backdrop-blur");
    expect(headerClass).toContain("color-mix");

    expect(headerClass).not.toContain("border-app-border/60 bg-app-bg-elevated/80 backdrop-blur-md");

    const main = container.querySelector('[data-slot="public-page-shell-main"]');
    expect(main).not.toBeNull();
    const mainClass = main?.getAttribute("class") ?? "";

    expect(mainClass).not.toContain("max-w-[1080px]");
    expect(mainClass).not.toContain("px-4 py-6");
    expect(container.textContent).toContain("content-slot");

    const footer = container.querySelector("footer");
    expect(footer).not.toBeNull();
    expect(footer?.getAttribute("class")).not.toContain("border-app-border/50");
    expect(footer?.getAttribute("class")).toContain("color-mix");
  });
});
