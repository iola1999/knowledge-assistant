import { describe, expect, test } from "vitest";

import {
  buildSystemSettingSections,
  normalizeSystemSettingUpdates,
} from "./system-settings";

describe("buildSystemSettingSections", () => {
  test("groups settings into stable sections and keeps unknown keys at the end", () => {
    const sections = buildSystemSettingSections([
      {
        settingKey: "anthropic_api_key",
        valueText: "secret",
        isSecret: true,
        description: "Anthropic API key.",
      },
      {
        settingKey: "s3_bucket",
        valueText: "law-doc",
        isSecret: false,
        description: "Primary object storage bucket.",
      },
      {
        settingKey: "custom_flag",
        valueText: "enabled",
        isSecret: false,
        description: "Custom setting.",
      },
      {
        settingKey: "app_url",
        valueText: "http://localhost:3000",
        isSecret: false,
        description: "Public base URL for the web app.",
      },
    ]);

    expect(sections.map((section) => section.id)).toEqual([
      "application",
      "storage",
      "model",
      "other",
    ]);
    expect(sections[0]?.items[0]).toMatchObject({
      settingKey: "app_url",
      inputKind: "text",
    });
    expect(sections[1]?.items[0]).toMatchObject({
      settingKey: "s3_bucket",
    });
    expect(sections[2]?.items[0]).toMatchObject({
      settingKey: "anthropic_api_key",
      inputKind: "password",
    });
    expect(sections[3]?.items[0]).toMatchObject({
      settingKey: "custom_flag",
    });
  });

  test("renders multi-value domain allowlist as textarea input", () => {
    const sections = buildSystemSettingSections([
      {
        settingKey: "fetch_allowed_domains",
        valueText: "example.com,example.org",
        isSecret: false,
        description: "Allowed domains.",
      },
    ]);

    expect(sections[0]?.items[0]).toMatchObject({
      settingKey: "fetch_allowed_domains",
      inputKind: "textarea",
    });
  });
});

describe("normalizeSystemSettingUpdates", () => {
  test("keeps only known keys, trims values, and lets the last duplicate win", () => {
    const updates = normalizeSystemSettingUpdates(
      [
        {
          settingKey: "s3_bucket",
          valueText: "  first  ",
        },
        {
          settingKey: "s3_bucket",
          valueText: " final-bucket ",
        },
        {
          settingKey: "anthropic_api_key",
          valueText: " secret-key ",
        },
      ],
      ["s3_bucket", "anthropic_api_key"],
    );

    expect(updates).toEqual([
      {
        settingKey: "s3_bucket",
        valueText: "final-bucket",
      },
      {
        settingKey: "anthropic_api_key",
        valueText: "secret-key",
      },
    ]);
  });

  test("rejects unknown keys instead of silently persisting them", () => {
    expect(() =>
      normalizeSystemSettingUpdates(
        [
          {
            settingKey: "unknown_key",
            valueText: "value",
          },
        ],
        ["s3_bucket"],
      ),
    ).toThrow("Unknown system setting: unknown_key");
  });
});
