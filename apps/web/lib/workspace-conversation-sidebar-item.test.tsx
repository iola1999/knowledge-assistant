// @vitest-environment jsdom

import { createElement, type ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { WorkspaceConversationSidebarItem } from "@/components/workspaces/workspace-conversation-sidebar-item";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    refresh,
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

describe("WorkspaceConversationSidebarItem", () => {
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

  test("replaces the sidebar time label with a loading spinner while responding", () => {
    act(() => {
      root.render(
        createElement(WorkspaceConversationSidebarItem, {
          workspaceId: "workspace-1",
          conversation: {
            id: "conversation-1",
            title: "正在生成的会话",
            updatedAt: new Date(),
            isResponding: true,
          },
        }),
      );
    });

    const spinner = container.querySelector('[aria-label="会话生成中"]');

    expect(spinner).toBeTruthy();
    expect(container.textContent).not.toContain("刚刚");
  });

  test("keeps the overflow menu and delete action available while responding", () => {
    act(() => {
      root.render(
        createElement(WorkspaceConversationSidebarItem, {
          workspaceId: "workspace-1",
          conversation: {
            id: "conversation-1",
            title: "正在生成的会话",
            updatedAt: new Date(),
            isResponding: true,
          },
        }),
      );
    });

    const menuButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.getAttribute("aria-label")?.includes("打开"),
    );

    expect(menuButton).toBeTruthy();

    act(() => {
      menuButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("删除");
  });

  test("marks the active conversation entry as the current page", () => {
    act(() => {
      root.render(
        createElement(WorkspaceConversationSidebarItem, {
          workspaceId: "workspace-1",
          activeConversationId: "conversation-1",
          conversation: {
            id: "conversation-1",
            title: "当前会话",
            updatedAt: new Date(),
          },
        }),
      );
    });

    const activeLink = container.querySelector('a[aria-current="page"]');

    expect(activeLink?.textContent).toContain("当前会话");
  });
});
