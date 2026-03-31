import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const create = vi.fn();
  const buildAnthropicClientConfigFromModelProfile = vi.fn();

  class AnthropicMock {
    messages = {
      create,
    };
  }

  return {
    AnthropicMock,
    buildAnthropicClientConfigFromModelProfile,
    create,
  };
});

vi.mock("@anthropic-ai/sdk", () => ({
  default: mocks.AnthropicMock,
}));

vi.mock("@anchordesk/db", () => ({
  buildAnthropicClientConfigFromModelProfile:
    mocks.buildAnthropicClientConfigFromModelProfile,
}));

describe("renderGroundedAnswer", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.buildAnthropicClientConfigFromModelProfile.mockReset();
    mocks.buildAnthropicClientConfigFromModelProfile.mockReturnValue({
      apiKey: "test-api-key",
      baseURL: "https://anthropic-proxy.example.com",
    });
  });

  it("fails closed when the Anthropic API key is missing", async () => {
    mocks.buildAnthropicClientConfigFromModelProfile.mockReturnValue({
      apiKey: "",
      baseURL: "https://anthropic-proxy.example.com",
    });

    const { renderGroundedAnswer } = await import("./final-answerer");

    await expect(
      renderGroundedAnswer({
        prompt: "总结一下",
        draftText: "草稿回答",
        evidence: [],
        modelProfile: {
          id: "model-profile-1",
          apiType: "anthropic",
          displayName: "Sonnet 4.5",
          modelName: "claude-sonnet-4-5",
          baseUrl: "https://anthropic-proxy.example.com",
          apiKey: "",
          enabled: true,
          isDefault: true,
        },
      }),
    ).rejects.toThrow("Anthropic API key is not configured.");
  });

  it("fails closed when streaming the grounded answer throws", async () => {
    mocks.create.mockRejectedValue(new Error("grounded renderer offline"));

    const { renderGroundedAnswer } = await import("./final-answerer");

    await expect(
      renderGroundedAnswer({
        prompt: "总结一下",
        draftText: "草稿回答",
        evidence: [],
        modelProfile: {
          id: "model-profile-1",
          apiType: "anthropic",
          displayName: "Sonnet 4.5",
          modelName: "claude-sonnet-4-5",
          baseUrl: "https://anthropic-proxy.example.com",
          apiKey: "sk-test",
          enabled: true,
          isDefault: true,
        },
      }),
    ).rejects.toThrow("grounded renderer offline");
  });
});
