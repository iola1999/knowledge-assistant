// @vitest-environment jsdom

import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { DocumentDetailsModal } from "./document-details-modal";

describe("DocumentDetailsModal", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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

  test("opens document details in a floating modal from the header trigger", () => {
    act(() => {
      root.render(
        createElement(
          DocumentDetailsModal,
          {
            title: "文档详情",
            children: createElement("div", null, "版本历史区"),
          },
        ),
      );
    });

    expect(container.textContent).toContain("文档详情");
    expect(document.body.textContent).not.toContain("版本历史区");

    const trigger = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("文档详情"),
    );

    act(() => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("版本历史区");

    const closeButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-label") === "关闭弹窗",
    );

    act(() => {
      closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.textContent).not.toContain("版本历史区");
  });

  test("keeps the trigger shrinkable inside narrow header action rows", () => {
    act(() => {
      root.render(
        createElement(
          "div",
          { className: "w-[120px]" },
          createElement(
            DocumentDetailsModal,
            {
              title: "文档详情",
              children: createElement("div", null, "版本历史区"),
            },
          ),
        ),
      );
    });

    const trigger = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("文档详情"),
    );
    const label = Array.from(trigger?.querySelectorAll("span") ?? []).find((span) =>
      span.textContent?.includes("文档详情"),
    );

    expect(trigger?.className).toContain("max-w-full");
    expect(trigger?.className).toContain("w-full");
    expect(trigger?.className).toContain("sm:w-auto");
    expect(label?.className).toContain("min-w-0");
    expect(label?.className).toContain("truncate");
  });
});
