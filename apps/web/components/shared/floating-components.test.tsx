// @vitest-environment jsdom

import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "./hover-card";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

describe("floating shared components", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    if (!("ResizeObserver" in window)) {
      class ResizeObserverMock {
        observe() {}
        unobserve() {}
        disconnect() {}
      }

      Object.defineProperty(window, "ResizeObserver", {
        configurable: true,
        writable: true,
        value: ResizeObserverMock,
      });
    }

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  test("renders popover content in a portal and dismisses it on outside press", () => {
    act(() => {
      root.render(
        createElement(
          Popover,
          null,
          createElement(
            PopoverTrigger,
            {
              asChild: true,
              children: createElement("button", { type: "button" }, "打开"),
            },
          ),
          createElement(PopoverContent, null, "弹层内容"),
        ),
      );
    });

    const trigger = container.querySelector("button");

    act(() => {
      trigger?.click();
    });

    expect(document.body.textContent).toContain("弹层内容");

    act(() => {
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });

    expect(document.body.textContent).not.toContain("弹层内容");
  });

  test("renders hover card content on focus", () => {
    act(() => {
      root.render(
        createElement(
          HoverCard,
          null,
          createElement(
            HoverCardTrigger,
            {
              asChild: true,
              children: createElement("button", { type: "button" }, "查看来源"),
            },
          ),
          createElement(HoverCardContent, null, "引用详情"),
        ),
      );
    });

    const trigger = container.querySelector("button");

    act(() => {
      trigger?.focus();
    });

    expect(document.body.textContent).toContain("引用详情");
  });
});
