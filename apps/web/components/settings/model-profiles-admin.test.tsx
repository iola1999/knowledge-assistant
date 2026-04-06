// @vitest-environment jsdom

import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ModelProfilesAdmin } from "./model-profiles-admin";

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

describe("ModelProfilesAdmin", () => {
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

  test("keeps the newly created model selected even before the parent refresh updates props", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          profileId: "model-2",
          profiles: [
            {
              id: "model-1",
              apiType: "anthropic",
              displayName: "默认模型",
              modelName: "claude-3",
              baseUrl: "https://api.anthropic.com",
              apiKey: "sk-1",
              enabled: true,
              isDefault: true,
            },
            {
              id: "model-2",
              apiType: "anthropic",
              displayName: "新模型",
              modelName: "claude-new",
              baseUrl: "https://api.anthropic.com",
              apiKey: "sk-2",
              enabled: true,
              isDefault: false,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await act(async () => {
      root.render(
        createElement(ModelProfilesAdmin, {
          profiles: [
            {
              id: "model-1",
              apiType: "anthropic",
              displayName: "默认模型",
              modelName: "claude-3",
              baseUrl: "https://api.anthropic.com",
              apiKey: "sk-1",
              enabled: true,
              isDefault: true,
            },
          ],
        }),
      );
    });

    const newModelButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("新建模型") && button.type === "button",
    ) as HTMLButtonElement | undefined;
    expect(newModelButton).toBeTruthy();

    await act(async () => {
      newModelButton?.click();
    });

    const inputs = Array.from(container.querySelectorAll("input"));
    const displayNameInput = inputs.find((input) => input.type !== "password") as HTMLInputElement;
    const modelNameInput = inputs.find((input) => input !== displayNameInput && input.type !== "password") as HTMLInputElement;
    const apiKeyInput = inputs.find((input) => input.type === "password") as HTMLInputElement;

    await act(async () => {
      displayNameInput.value = "新模型";
      displayNameInput.dispatchEvent(new Event("input", { bubbles: true }));
      modelNameInput.value = "claude-new";
      modelNameInput.dispatchEvent(new Event("input", { bubbles: true }));
      apiKeyInput.value = "sk-2";
      apiKeyInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const submitButton = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitButton?.textContent).toContain("创建模型");

    await act(async () => {
      submitButton.click();
    });

    expect(messageApi.success).toHaveBeenCalledWith("模型已创建");
    expect(container.textContent).toContain("已配置 2 个模型");

    const selected = Array.from(container.querySelectorAll('button[aria-current="page"]')).find((button) =>
      button.textContent?.includes("新模型"),
    );
    expect(selected).toBeTruthy();
  });

  test("locks the submit button while the create request is in-flight", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => new Promise(() => {}));

    await act(async () => {
      root.render(
        createElement(ModelProfilesAdmin, {
          profiles: [],
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

