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
        settingKey: "web_search_provider",
        valueText: "brave",
        isSecret: false,
        summary: "联网搜索 Provider",
        description: "Web search provider.",
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
      settingKey: "web_search_provider",
      inputKind: "text",
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

  test("keeps runtime and fetch concurrency settings near their related controls", () => {
    const sections = buildSystemSettingSections([
      {
        settingKey: "fetch_source_max_concurrency",
        valueText: "3",
        isSecret: false,
        summary: "抓取工具最大并发数",
        description: "Maximum number of concurrent fetch_source requests.",
      },
      {
        settingKey: "agent_runtime_url",
        valueText: "http://localhost:4001",
        isSecret: false,
        summary: "Agent Runtime 地址",
        description: "Base URL for the agent runtime service.",
      },
      {
        settingKey: "agent_runtime_respond_worker_concurrency",
        valueText: "2",
        isSecret: false,
        summary: "回答 Worker 并发数",
        description: "BullMQ worker concurrency for conversation.respond.",
      },
      {
        settingKey: "fetch_allowed_domains",
        valueText: "example.com",
        isSecret: false,
        summary: "抓取白名单",
        description: "Allowed domains.",
      },
    ]);

    expect(sections.map((section) => section.id)).toEqual(["application"]);
    expect(sections[0]?.items.map((item) => item.settingKey)).toEqual([
      "agent_runtime_url",
      "agent_runtime_respond_worker_concurrency",
      "fetch_allowed_domains",
      "fetch_source_max_concurrency",
    ]);
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

  test("groups parser OCR settings into the model section and keeps them ahead of generic DashScope settings", () => {
    const sections = buildSystemSettingSections([
      {
        settingKey: "dashscope_api_key",
        valueText: "secret",
        isSecret: true,
        summary: "DashScope 通用密钥",
        description: "Shared DashScope API key fallback.",
      },
      {
        settingKey: "parser_ocr_provider",
        valueText: "dashscope",
        isSecret: false,
        summary: "Parser OCR provider",
        description: "OCR provider for scanned PDFs.",
      },
      {
        settingKey: "parser_ocr_dashscope_api_key",
        valueText: "secret",
        isSecret: true,
        summary: "Parser OCR API key",
        description: "DashScope OCR API key override.",
      },
      {
        settingKey: "parser_ocr_dashscope_task",
        valueText: "advanced_recognition",
        isSecret: false,
        summary: "Parser OCR task",
        description: "DashScope OCR task override.",
      },
    ]);

    expect(sections.map((section) => section.id)).toEqual(["model"]);
    expect(sections[0]?.items.map((item) => item.settingKey)).toEqual([
      "parser_ocr_provider",
      "parser_ocr_dashscope_api_key",
      "parser_ocr_dashscope_task",
      "dashscope_api_key",
    ]);
  });

  test("keeps final-answer token settings next to other model runtime parameters", () => {
    const sections = buildSystemSettingSections([
      {
        settingKey: "embedding_provider",
        valueText: "local_hash",
        isSecret: false,
        summary: "Embedding Provider",
        description: "Embedding provider override.",
      },
      {
        settingKey: "anthropic_final_answer_max_tokens",
        valueText: "1400",
        isSecret: false,
        summary: "最终答案最大输出",
        description: "Final answer maximum output tokens.",
      },
      {
        settingKey: "web_search_provider",
        valueText: "brave",
        isSecret: false,
        summary: "联网搜索 Provider",
        description: "Web search provider.",
      },
    ]);

    expect(sections.map((section) => section.id)).toEqual(["model"]);
    expect(sections[0]?.items.map((item) => item.settingKey)).toEqual([
      "web_search_provider",
      "anthropic_final_answer_max_tokens",
      "embedding_provider",
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
        settingKey: "anthropic_final_answer_max_tokens",
        valueText: "1400",
        isSecret: false,
        summary: "最终答案最大输出",
        description: "Final answer maximum output tokens.",
      },
    ]);

    expect(filterSystemSettingSections(sections, "anthropic")).toEqual([
      expect.objectContaining({
        id: "model",
        items: [expect.objectContaining({ settingKey: "anthropic_final_answer_max_tokens" })],
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
          settingKey: "anthropic_final_answer_max_tokens",
          valueText: " 1600 ",
        },
      ],
      ["s3_bucket", "anthropic_final_answer_max_tokens"],
    );

    expect(updates).toEqual([
      {
        settingKey: "s3_bucket",
        valueText: "final-bucket",
      },
      {
        settingKey: "anthropic_final_answer_max_tokens",
        valueText: "1600",
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
