import { describe, expect, test } from "vitest";

import {
  buildAnthropicClientConfig,
  buildAnthropicClientConfigFromModelProfile,
  buildClaudeAgentEnv,
  buildClaudeAgentEnvFromModelProfile,
  getConfiguredAnthropicApiKey,
  getConfiguredAnthropicBaseUrl,
} from "./anthropic-config";

describe("Anthropic runtime config helpers", () => {
  test("reads configured anthropic api key and base url from runtime env", () => {
    const env = {
      ANTHROPIC_API_KEY: "test-api-key",
      ANTHROPIC_BASE_URL: "https://anthropic-proxy.example.com",
    };

    expect(getConfiguredAnthropicApiKey(env)).toBe("test-api-key");
    expect(getConfiguredAnthropicBaseUrl(env)).toBe(
      "https://anthropic-proxy.example.com",
    );
  });

  test("treats empty values as unset and preserves non-empty configured values", () => {
    const env = {
      ANTHROPIC_API_KEY: " example-anthropic-api-key ",
      ANTHROPIC_BASE_URL: " ",
    };

    expect(getConfiguredAnthropicApiKey(env)).toBe("example-anthropic-api-key");
    expect(getConfiguredAnthropicBaseUrl(env)).toBeUndefined();
  });

  test("builds anthropic sdk client config with optional baseURL", () => {
    expect(
      buildAnthropicClientConfig({
        ANTHROPIC_API_KEY: "test-api-key",
        ANTHROPIC_BASE_URL: "https://anthropic-proxy.example.com",
      }),
    ).toEqual({
      apiKey: "test-api-key",
      baseURL: "https://anthropic-proxy.example.com",
    });

    expect(
      buildAnthropicClientConfig({
        ANTHROPIC_API_KEY: "test-api-key",
      }),
    ).toEqual({
      apiKey: "test-api-key",
    });
  });

  test("builds agent sdk env with trimmed anthropic credentials", () => {
    expect(
      buildClaudeAgentEnv({
        PATH: "/usr/bin",
        ANTHROPIC_API_KEY: "test-api-key",
        ANTHROPIC_BASE_URL: "https://anthropic-proxy.example.com",
      }),
    ).toMatchObject({
      PATH: "/usr/bin",
      ANTHROPIC_API_KEY: "test-api-key",
      ANTHROPIC_BASE_URL: "https://anthropic-proxy.example.com",
    });

    expect(
      buildClaudeAgentEnv({
        ANTHROPIC_API_KEY: "example-anthropic-api-key",
        ANTHROPIC_BASE_URL: "",
      }),
    ).toMatchObject({
      ANTHROPIC_API_KEY: "example-anthropic-api-key",
      ANTHROPIC_BASE_URL: undefined,
    });
  });

  test("builds anthropic client config from a stored model profile", () => {
    expect(
      buildAnthropicClientConfigFromModelProfile({
        apiKey: " sk-model ",
        baseUrl: " https://anthropic-proxy.example.com ",
      }),
    ).toEqual({
      apiKey: "sk-model",
      baseURL: "https://anthropic-proxy.example.com",
    });
  });

  test("builds agent env from a stored model profile without falling back to stale runtime env", () => {
    expect(
      buildClaudeAgentEnvFromModelProfile(
        {
          apiKey: " sk-model ",
          baseUrl: " https://anthropic-proxy.example.com ",
          modelName: " claude-sonnet-4-5 ",
        },
        {
          PATH: "/usr/bin",
          ANTHROPIC_API_KEY: "stale-key",
          ANTHROPIC_BASE_URL: "https://stale.example.com",
          ANTHROPIC_MODEL: "stale-model",
        },
      ),
    ).toMatchObject({
      PATH: "/usr/bin",
      ANTHROPIC_API_KEY: "sk-model",
      ANTHROPIC_BASE_URL: "https://anthropic-proxy.example.com",
      ANTHROPIC_MODEL: "claude-sonnet-4-5",
    });
  });
});
