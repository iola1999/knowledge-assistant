import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const create = vi.fn();
  const getConfiguredAnthropicApiKey = vi.fn();

  class AnthropicMock {
    messages = {
      create,
    };
  }

  return {
    AnthropicMock,
    create,
    getConfiguredAnthropicApiKey,
  };
});

vi.mock("@anthropic-ai/sdk", () => ({
  default: mocks.AnthropicMock,
}));

vi.mock("@anchordesk/db", () => ({
  buildAnthropicClientConfig: () => ({
    apiKey: "test-api-key",
  }),
  getConfiguredAnthropicApiKey: mocks.getConfiguredAnthropicApiKey,
}));

describe("renderGroundedAnswer", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.getConfiguredAnthropicApiKey.mockReset();
  });

  it("fails closed when the Anthropic API key is missing", async () => {
    mocks.getConfiguredAnthropicApiKey.mockReturnValue("");

    const { renderGroundedAnswer } = await import("./final-answerer");

    await expect(
      renderGroundedAnswer({
        prompt: "总结一下",
        draftText: "草稿回答",
        evidence: [],
      }),
    ).rejects.toThrow("Anthropic API key is not configured.");
  });

  it("fails closed when streaming the grounded answer throws", async () => {
    mocks.getConfiguredAnthropicApiKey.mockReturnValue("test-api-key");
    mocks.create.mockRejectedValue(new Error("grounded renderer offline"));

    const { renderGroundedAnswer } = await import("./final-answerer");

    await expect(
      renderGroundedAnswer({
        prompt: "总结一下",
        draftText: "草稿回答",
        evidence: [],
      }),
    ).rejects.toThrow("grounded renderer offline");
  });
});
