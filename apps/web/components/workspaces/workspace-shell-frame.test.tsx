// @vitest-environment jsdom

import { createElement, type ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { WorkspaceShellFrame } from "./workspace-shell-frame";

vi.mock("next/navigation", () => ({
  usePathname: () => "/workspaces/workspace-1/knowledge-base",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => createElement("a", { href, ...props }, children),
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
  useSession: () => ({
    data: {
      user: {
        name: "Fan",
        username: "fan",
      },
    },
  }),
}));

describe("WorkspaceShellFrame", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.matchMedia ??= ((query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList);
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

  test("marks the active workspace section with page semantics", () => {
    act(() => {
      root.render(
        createElement(WorkspaceShellFrame, {
          workspace: { id: "workspace-1", title: "Alpha" },
          workspaces: [{ id: "workspace-1", title: "Alpha" }],
          conversations: [],
          activeView: "knowledge-base",
          currentUser: { username: "fan", isSuperAdmin: true },
          canAccessSystemSettings: true,
          breadcrumbs: [{ label: "空间", href: "/workspaces" }, { label: "Alpha" }],
          children: createElement("div", null, "content"),
        }),
      );
    });

    const currentLink = container.querySelector('a[aria-current="page"]');
    expect(currentLink?.textContent).toContain("资料库");
  });

  test("marks the create conversation entry as current when no conversation is selected", () => {
    act(() => {
      root.render(
        createElement(WorkspaceShellFrame, {
          workspace: { id: "workspace-1", title: "Alpha" },
          workspaces: [{ id: "workspace-1", title: "Alpha" }],
          conversations: [],
          activeView: "chat",
          currentUser: { username: "fan", isSuperAdmin: true },
          canAccessSystemSettings: true,
          breadcrumbs: [{ label: "空间", href: "/workspaces" }, { label: "Alpha" }],
          children: createElement("div", null, "content"),
        }),
      );
    });

    const createLink = Array.from(container.querySelectorAll('a[aria-current="page"]')).find((link) =>
      link.textContent?.includes("新建会话"),
    );

    expect(createLink).toBeTruthy();
  });

  test("keeps the workspace root breadcrumb reachable on mobile conversation pages", () => {
    act(() => {
      root.render(
        createElement(WorkspaceShellFrame, {
          workspace: { id: "workspace-1", title: "Alpha" },
          workspaces: [{ id: "workspace-1", title: "Alpha" }],
          conversations: [
            {
              id: "conversation-1",
              title: "当前会话",
              status: "active",
              updatedAt: new Date(),
            },
          ],
          activeView: "chat",
          activeConversationId: "conversation-1",
          currentConversation: { id: "conversation-1", title: "当前会话" },
          currentUser: { username: "fan", isSuperAdmin: true },
          canAccessSystemSettings: true,
          breadcrumbs: [
            { label: "空间", href: "/workspaces" },
            { label: "Alpha" },
            { label: "当前会话" },
          ],
          children: createElement("div", null, "content"),
        }),
      );
    });

    const rootCrumb = Array.from(container.querySelectorAll<HTMLAnchorElement>("a")).find((link) =>
      link.textContent?.includes("空间"),
    );
    expect(rootCrumb).toBeTruthy();
    expect(rootCrumb?.getAttribute("href")).toContain("/workspaces");
  });
});
