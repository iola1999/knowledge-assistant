// @vitest-environment jsdom

import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { KnowledgeBaseExplorer } from "./knowledge-base-explorer";

vi.mock("next/navigation", () => ({
  usePathname: () => "/workspaces/workspace-1/knowledge-base",
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => createElement("a", { href, ...props }, children),
}));

describe("KnowledgeBaseExplorer", () => {
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

  test("renders the read-only notice and back link for mounted libraries", () => {
    act(() => {
      root.render(
        createElement(KnowledgeBaseExplorer, {
          initialCurrentPath: "/",
          currentDirectoryId: null,
          directories: [],
          documents: [],
          documentsEndpoint: "/api/knowledge-libraries/library-1/documents",
          editable: false,
          canManageTasks: false,
          mountedLibraries: [],
          readOnlyNotice: "已挂载只读 · 设计系统库",
          scopeLabel: "订阅资料库",
          backLink: { href: "/workspaces/workspace-1/knowledge-base", label: "返回我的资料" },
        }),
      );
    });

    expect(container.textContent).toContain("已挂载只读 · 设计系统库");
    expect(
      container.querySelector('a[href="/workspaces/workspace-1/knowledge-base"]')?.textContent,
    ).toContain("返回我的资料");
  });
});
