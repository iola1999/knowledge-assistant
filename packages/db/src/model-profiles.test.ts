import { describe, expect, test } from "vitest";

import { MODEL_PROFILE_API_TYPE } from "@anchordesk/contracts";

import {
  assertModelProfileSelectable,
  assertModelProfileUsable,
  formatModelProfileLabel,
  normalizeModelProfileRecord,
  type ModelProfileRecord,
} from "./model-profiles";

function buildProfile(
  overrides: Partial<ModelProfileRecord> = {},
): ModelProfileRecord {
  return {
    id: "profile-1",
    apiType: MODEL_PROFILE_API_TYPE.ANTHROPIC,
    displayName: " Sonnet 4.5 ",
    modelName: " claude-sonnet-4-5 ",
    baseUrl: " https://api.anthropic.com ",
    apiKey: " sk-test ",
    enabled: true,
    isDefault: true,
    ...overrides,
  };
}

describe("normalizeModelProfileRecord", () => {
  test("trims runtime-facing model profile fields", () => {
    expect(normalizeModelProfileRecord(buildProfile())).toEqual({
      id: "profile-1",
      apiType: MODEL_PROFILE_API_TYPE.ANTHROPIC,
      displayName: "Sonnet 4.5",
      modelName: "claude-sonnet-4-5",
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-test",
      enabled: true,
      isDefault: true,
    });
  });
});

describe("formatModelProfileLabel", () => {
  test("prefers display name and falls back to model name", () => {
    expect(
      formatModelProfileLabel({
        displayName: "对话模型",
        modelName: "claude-sonnet-4-5",
      }),
    ).toBe("对话模型");
    expect(
      formatModelProfileLabel({
        displayName: " ",
        modelName: "claude-sonnet-4-5",
      }),
    ).toBe("claude-sonnet-4-5");
  });
});

describe("assertModelProfileSelectable", () => {
  test("rejects missing and disabled profiles", () => {
    expect(() => assertModelProfileSelectable(null)).toThrow(
      "Selected model profile does not exist.",
    );
    expect(() =>
      assertModelProfileSelectable(buildProfile({ enabled: false })),
    ).toThrow("Selected model profile is disabled.");
  });
});

describe("assertModelProfileUsable", () => {
  test("requires a supported api type and complete credentials", () => {
    expect(() =>
      assertModelProfileUsable(
        buildProfile({
          apiType: "openai_compatible" as ModelProfileRecord["apiType"],
        }),
      ),
    ).toThrow("Selected model profile uses an unsupported API type.");
    expect(() => assertModelProfileUsable(buildProfile({ modelName: " " }))).toThrow(
      "Model profile name is not configured.",
    );
    expect(() => assertModelProfileUsable(buildProfile({ baseUrl: "" }))).toThrow(
      "Model profile base URL is not configured.",
    );
    expect(() => assertModelProfileUsable(buildProfile({ apiKey: " " }))).toThrow(
      "Model profile API key is not configured.",
    );
  });
});
