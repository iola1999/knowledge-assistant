// @vitest-environment jsdom

import { createElement, type ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { WorkspaceUserPanel } from "@/components/workspaces/workspace-user-panel";

vi.mock("next/navigation", () => ({
  usePathname: () => "/workspaces/workspace-1",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
  useSession: () => ({
    data: {
      user: {
        name: "Fan",
        username: "fwl1998",
      },
    },
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

describe("WorkspaceUserPanel", () => {
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

  test("renders the account menu above the mobile drawer overlay layer", () => {
    act(() => {
      root.render(
        createElement(WorkspaceUserPanel, {
          initialUser: {
            name: "Fan",
            username: "fwl1998",
          },
          canAccessSystemSettings: true,
        }),
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="展开账号菜单"]');

    expect(trigger).toBeTruthy();

    act(() => {
      trigger?.click();
    });

    const popover = document.body.querySelector<HTMLDivElement>('[role="dialog"]');

    expect(popover?.textContent).toContain("账号与安全");
    expect(popover?.className).toContain("z-60");
  });
});
