// @vitest-environment jsdom

import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { PdfViewer } from "./pdf-viewer";

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 8,
      getPage: () =>
        Promise.resolve({
          getViewport: () => ({ width: 240, height: 320 }),
          render: () => ({ promise: Promise.resolve() }),
          getTextContent: () => Promise.resolve({ items: [{ str: "第一页内容" }] }),
        }),
    }),
  }),
}));

describe("PdfViewer", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: vi.fn(() => ({
        canvas: document.createElement("canvas"),
      })),
    });
  });

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

  test("lets the reader header wrap before controls overflow on tighter widths", async () => {
    await act(async () => {
      root.render(
        createElement(PdfViewer, {
          fileUrl: "/demo.pdf",
          title: "这是一份很长很长的文档标题，用来验证阅读器头部在窄宽度下的收缩行为",
          initialPage: 1,
        }),
      );
      await Promise.resolve();
    });

    const heading = Array.from(container.querySelectorAll("h3")).find(
      (element) => element.textContent === "PDF 阅读器",
    );
    const layoutRoot = container.querySelector("div.grid.w-full");
    const readerColumn = layoutRoot?.children.item(1) as HTMLDivElement | null;
    const titleBlock = heading?.parentElement;
    const titleMeta = Array.from(container.querySelectorAll("p")).find((element) =>
      element.textContent?.includes("这是一份很长很长的文档标题"),
    );
    const previousButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent === "上一页",
    );
    const controls = previousButton?.parentElement;

    expect(titleBlock?.className).toContain("min-w-0");
    expect(titleMeta?.className).toContain("max-w-full");
    expect(readerColumn?.className).toContain("lg:col-start-2");
    expect(readerColumn?.className).toContain("lg:row-start-1");
    expect(controls?.className).toContain("w-full");
    expect(controls?.className).toContain("lg:w-auto");
    expect(controls?.className).toContain("justify-start");
  });
});
