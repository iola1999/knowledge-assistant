// @vitest-environment jsdom

import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { SystemSettingsForm } from "./system-settings-form";

const refreshMock = vi.fn();
const messageApi = {
  success: vi.fn(),
  error: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
  useSearchParams: () => new URLSearchParams(),
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

vi.mock("@/components/shared/message-provider", () => ({
  useMessage: () => messageApi,
}));

describe("SystemSettingsForm", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    refreshMock.mockReset();
    messageApi.success.mockReset();
    messageApi.error.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  test("locks the submit button while the save request is in-flight", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => new Promise(() => {}));

    await act(async () => {
      root.render(
        createElement(SystemSettingsForm, {
          sections: [
            {
              id: "providers",
              title: "提供方",
              description: "测试用参数分组",
              items: [
                {
                  settingKey: "test_key",
                  valueText: "",
                  inputKind: "text",
                  isSecret: false,
                  summary: null,
                  description: null,
                },
              ],
            },
          ],
        }),
      );
    });

    const submitButton = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitButton).toBeTruthy();

    await act(async () => {
      submitButton.click();
    });

    const submitButtonAfter = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitButtonAfter.disabled).toBe(true);

    await act(async () => {
      submitButtonAfter.click();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

