import { describe, expect, test } from "vitest";

import {
  AUTH_ALLOW_REGISTRATION_SETTING_KEY,
  buildSystemSettingSections,
  filterSystemSettingSections,
  normalizeSystemSettingUpdates,
  parseSystemSettingBoolean,
} from "./system-settings";

describe("buildSystemSettingSections", () => {
  test("groups settings into stable sections and keeps unknown keys at the end", () => {
    const sections = buildSystemSettingSections([
      {
        settingKey: "anthropic_api_key",
        valueText: "secret",
        isSecret: true,
        summary: "Anthropic 密钥",
        description: "Anthropic API key.",
      },
      {
        settingKey: "s3_bucket",
        valueText: "anchordesk",
        isSecret: false,
        summary: "对象存储桶",
        description: "Primary object storage bucket.",
      },
      {
        settingKey: "custom_flag",
        valueText: "enabled",
        isSecret: false,
        summary: "自定义开关",
        description: "Custom setting.",
      },
      {
        settingKey: "app_url",
        valueText: "http://localhost:3000",
        isSecret: false,
        summary: "Web 访问地址",
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
      summary: "Web 访问地址",
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
        summary: "抓取白名单",
        description: "Allowed domains.",
      },
    ]);

    expect(sections[0]?.items[0]).toMatchObject({
      settingKey: "fetch_allowed_domains",
      inputKind: "textarea",
    });
  });

  test("groups web search settings into the model section", () => {
    const sections = buildSystemSettingSections([
      {
        settingKey: "web_search_provider",
        valueText: "brave",
        isSecret: false,
        summary: "联网搜索 Provider",
        description: "Web search provider.",
      },
      {
        settingKey: "brave_search_api_key",
        valueText: "secret",
        isSecret: true,
        summary: "Brave Search 密钥",
        description: "Brave API key.",
      },
    ]);

    expect(sections.map((section) => section.id)).toEqual(["model"]);
    expect(sections[0]?.items).toEqual([
      expect.objectContaining({
        settingKey: "web_search_provider",
        inputKind: "text",
      }),
      expect.objectContaining({
        settingKey: "brave_search_api_key",
        inputKind: "password",
      }),
    ]);
  });

  test("keeps anthropic base url next to other anthropic model settings", () => {
    const sections = buildSystemSettingSections([
      {
        settingKey: "anthropic_model",
        valueText: "claude-sonnet-4-5",
        isSecret: false,
        summary: "Anthropic 模型",
        description: "Anthropic model override.",
      },
      {
        settingKey: "anthropic_base_url",
        valueText: "https://anthropic-proxy.example.com",
        isSecret: false,
        summary: "Anthropic 基础地址",
        description: "Anthropic API base URL override.",
      },
      {
        settingKey: "anthropic_api_key",
        valueText: "secret",
        isSecret: true,
        summary: "Anthropic 密钥",
        description: "Anthropic API key.",
      },
    ]);

    expect(sections.map((section) => section.id)).toEqual(["model"]);
    expect(sections[0]?.items.map((item) => item.settingKey)).toEqual([
      "anthropic_api_key",
      "anthropic_base_url",
      "anthropic_model",
    ]);
  });

  test("treats registration gate as an application boolean setting", () => {
    const sections = buildSystemSettingSections([
      {
        settingKey: AUTH_ALLOW_REGISTRATION_SETTING_KEY,
        valueText: "false",
        isSecret: false,
        summary: "注册开关",
        description: "Whether new users can register.",
      },
    ]);

    expect(sections.map((section) => section.id)).toEqual(["application"]);
    expect(sections[0]?.items[0]).toMatchObject({
      settingKey: AUTH_ALLOW_REGISTRATION_SETTING_KEY,
      inputKind: "boolean",
    });
  });
});

describe("filterSystemSettingSections", () => {
  test("matches setting keys, summaries, and descriptions", () => {
    const sections = buildSystemSettingSections([
      {
        settingKey: "app_url",
        valueText: "http://localhost:3000",
        isSecret: false,
        summary: "Web 访问地址",
        description: "Public base URL for the web app.",
      },
      {
        settingKey: "redis_url",
        valueText: "redis://localhost:6379",
        isSecret: false,
        summary: "队列与缓存地址",
        description: "Redis connection URL.",
      },
    ]);

    expect(filterSystemSettingSections(sections, "redis")[0]?.items).toEqual([
      expect.objectContaining({ settingKey: "redis_url" }),
    ]);
    expect(filterSystemSettingSections(sections, "访问地址")[0]?.items).toEqual([
      expect.objectContaining({ settingKey: "app_url" }),
    ]);
    expect(filterSystemSettingSections(sections, "connection url")[0]?.items).toEqual([
      expect.objectContaining({ settingKey: "redis_url" }),
    ]);
  });

  test("does not keep unrelated settings only because the section description matches", () => {
    const sections = buildSystemSettingSections([
      {
        settingKey: "redis_url",
        valueText: "redis://localhost:6379",
        isSecret: false,
        summary: "队列与缓存地址",
        description: "Redis connection URL.",
      },
      {
        settingKey: "qdrant_url",
        valueText: "http://localhost:6333",
        isSecret: false,
        summary: "向量检索地址",
        description: "Qdrant base URL.",
      },
      {
        settingKey: "s3_bucket",
        valueText: "anchordesk",
        isSecret: false,
        summary: "对象存储桶",
        description: "Primary object storage bucket.",
      },
    ]);

    expect(filterSystemSettingSections(sections, "redis")).toEqual([
      expect.objectContaining({
        id: "storage",
        items: [expect.objectContaining({ settingKey: "redis_url" })],
      }),
    ]);
  });

  test("keeps only sections with matched settings", () => {
    const sections = buildSystemSettingSections([
      {
        settingKey: "app_url",
        valueText: "http://localhost:3000",
        isSecret: false,
        summary: "Web 访问地址",
        description: "Public base URL for the web app.",
      },
      {
        settingKey: "anthropic_api_key",
        valueText: "secret",
        isSecret: true,
        summary: "Anthropic 密钥",
        description: "Anthropic API key.",
      },
    ]);

    expect(filterSystemSettingSections(sections, "anthropic")).toEqual([
      expect.objectContaining({
        id: "model",
        items: [expect.objectContaining({ settingKey: "anthropic_api_key" })],
      }),
    ]);
  });
});

describe("normalizeSystemSettingUpdates", () => {
  test("canonicalizes Brave search language aliases before persisting", () => {
    expect(
      normalizeSystemSettingUpdates(
        [
          {
            settingKey: "web_search_search_lang",
            valueText: " zh ",
          },
          {
            settingKey: "web_search_provider",
            valueText: " brave ",
          },
        ],
        ["web_search_search_lang", "web_search_provider"],
      ),
    ).toEqual([
      {
        settingKey: "web_search_provider",
        valueText: "brave",
      },
      {
        settingKey: "web_search_search_lang",
        valueText: "zh-hans",
      },
    ]);
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

describe("parseSystemSettingBoolean", () => {
  test("recognizes common true and false variants", () => {
    expect(parseSystemSettingBoolean("true")).toBe(true);
    expect(parseSystemSettingBoolean(" enabled ")).toBe(true);
    expect(parseSystemSettingBoolean("0", true)).toBe(false);
    expect(parseSystemSettingBoolean("off", true)).toBe(false);
  });

  test("falls back when the stored value is empty or invalid", () => {
    expect(parseSystemSettingBoolean("", true)).toBe(true);
    expect(parseSystemSettingBoolean("unknown", false)).toBe(false);
    expect(parseSystemSettingBoolean(null, true)).toBe(true);
  });
});
