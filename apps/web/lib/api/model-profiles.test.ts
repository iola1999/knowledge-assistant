import { describe, expect, test } from "vitest";

import {
  formatEnabledModelProfileLabel,
  formatUserFacingModelProfileLabel,
  isVisibleSystemSettingKey,
  modelProfileMutationSchema,
  resolveInitialModelProfileId,
} from "./model-profiles";

describe("formatEnabledModelProfileLabel", () => {
  test("shows both display name and model name when they differ", () => {
    expect(
      formatEnabledModelProfileLabel({
        displayName: "Claude Sonnet 4.5",
        modelName: "claude-sonnet-4-5",
      }),
    ).toBe("Claude Sonnet 4.5 · claude-sonnet-4-5");
  });

  test("falls back to the model name when the display name is empty", () => {
    expect(
      formatEnabledModelProfileLabel({
        displayName: "   ",
        modelName: "claude-sonnet-4-5",
      }),
    ).toBe("claude-sonnet-4-5");
  });
});

describe("formatUserFacingModelProfileLabel", () => {
  test("shows only the display name for user-facing model pickers", () => {
    expect(
      formatUserFacingModelProfileLabel({
        displayName: "Claude Sonnet 4.5",
        modelName: "claude-sonnet-4-5",
      }),
    ).toBe("Claude Sonnet 4.5");
  });

  test("falls back to the model name when the display name is empty", () => {
    expect(
      formatUserFacingModelProfileLabel({
        displayName: "   ",
        modelName: "claude-sonnet-4-5",
      }),
    ).toBe("claude-sonnet-4-5");
  });
});

describe("resolveInitialModelProfileId", () => {
  test("prefers the requested enabled model, then default, then the first available item", () => {
    expect(
      resolveInitialModelProfileId({
        availableModelProfiles: [
          {
            id: "profile-1",
            displayName: "Claude Sonnet 4.5",
            modelName: "claude-sonnet-4-5",
            isDefault: true,
          },
          {
            id: "profile-2",
            displayName: "Claude Opus 4",
            modelName: "claude-opus-4",
            isDefault: false,
          },
        ],
        defaultModelProfileId: "profile-1",
        preferredModelProfileId: "profile-2",
      }),
    ).toBe("profile-2");

    expect(
      resolveInitialModelProfileId({
        availableModelProfiles: [
          {
            id: "profile-1",
            displayName: "Claude Sonnet 4.5",
            modelName: "claude-sonnet-4-5",
            isDefault: true,
          },
        ],
        defaultModelProfileId: "profile-1",
        preferredModelProfileId: "missing",
      }),
    ).toBe("profile-1");
  });
});

describe("modelProfileMutationSchema", () => {
  test("trims model profile text fields and validates required values", () => {
    expect(
      modelProfileMutationSchema.parse({
        displayName: " Claude Sonnet 4.5 ",
        modelName: " claude-sonnet-4-5 ",
        baseUrl: " https://api.anthropic.com ",
        apiKey: " sk-test ",
        enabled: true,
        isDefault: true,
      }),
    ).toEqual({
      displayName: "Claude Sonnet 4.5",
      modelName: "claude-sonnet-4-5",
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-test",
      enabled: true,
      isDefault: true,
    });
  });
});

describe("isVisibleSystemSettingKey", () => {
  test("hides deprecated anthropic model keys from the system parameters page", () => {
    expect(isVisibleSystemSettingKey("anthropic_api_key")).toBe(false);
    expect(isVisibleSystemSettingKey("anthropic_model")).toBe(false);
    expect(isVisibleSystemSettingKey("anthropic_final_answer_max_tokens")).toBe(true);
    expect(isVisibleSystemSettingKey("redis_url")).toBe(true);
  });
});
