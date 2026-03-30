import { describe, expect, it } from "vitest";

import {
  buildRuntimeEnvironment,
  buildSystemSettingSeedRows,
  mapSystemSettingRowsToEnv,
  resolveSystemSettingsEnv,
} from "./lib/system-settings.mjs";

describe("buildSystemSettingSeedRows", () => {
  it("prefers explicit environment values and falls back to defaults", () => {
    const rows = buildSystemSettingSeedRows({
      REDIS_URL: "redis://custom:6379",
      ANTHROPIC_API_KEY: "secret-key",
      BRAVE_SEARCH_API_KEY: "brave-secret",
    });

    expect(rows.find((row) => row.settingKey === "redis_url")).toMatchObject({
      settingKey: "redis_url",
      valueText: "redis://custom:6379",
      isSecret: false,
      summary: "BullMQ 与会话 allowlist 使用的 Redis 地址。",
    });
    expect(rows.find((row) => row.settingKey === "anthropic_api_key")).toMatchObject({
      settingKey: "anthropic_api_key",
      valueText: "secret-key",
      isSecret: true,
      summary: "Agent 规划与最终答案使用的 Anthropic 密钥。",
    });
    expect(rows.find((row) => row.settingKey === "anthropic_base_url")).toMatchObject({
      settingKey: "anthropic_base_url",
      valueText: "https://api.anthropic.com",
      isSecret: false,
      summary: "Anthropic API 的基础地址覆盖值。",
    });
    expect(rows.find((row) => row.settingKey === "brave_search_api_key")).toMatchObject({
      settingKey: "brave_search_api_key",
      valueText: "brave-secret",
      isSecret: true,
    });
    expect(rows.find((row) => row.settingKey === "qdrant_collection")).toMatchObject({
      settingKey: "qdrant_collection",
      valueText: "knowledge_chunks",
    });
    expect(rows.find((row) => row.settingKey === "anthropic_model")).toMatchObject({
      settingKey: "anthropic_model",
      valueText: "claude-sonnet-4-5",
    });
    expect(rows.find((row) => row.settingKey === "web_search_search_lang")).toMatchObject({
      settingKey: "web_search_search_lang",
      valueText: "zh-hans",
    });
    expect(rows.find((row) => row.settingKey === "embedding_provider")).toMatchObject({
      settingKey: "embedding_provider",
      valueText: "local_hash",
    });
    expect(rows.find((row) => row.settingKey === "auth_allow_registration")).toMatchObject({
      settingKey: "auth_allow_registration",
      valueText: "true",
      isSecret: false,
    });
    expect(rows.some((row) => row.settingKey === "auth_trust_host")).toBe(false);
  });
});

describe("system settings env resolution", () => {
  it("maps database rows back to process environment names", () => {
    expect(
      mapSystemSettingRowsToEnv([
        {
          settingKey: "s3_bucket",
          valueText: "custom-bucket",
        },
        {
          settingKey: "anthropic_api_key",
          valueText: "top-secret",
        },
      ]),
    ).toEqual({
      S3_BUCKET: "custom-bucket",
      ANTHROPIC_API_KEY: "top-secret",
    });
  });

  it("applies env override before database values and database values before defaults", () => {
    const rows = [
      {
        settingKey: "redis_url",
        valueText: "redis://from-db:6379",
      },
      {
        settingKey: "qdrant_url",
        valueText: "http://from-db:6333",
      },
    ];

    expect(
      resolveSystemSettingsEnv(
        {
          REDIS_URL: "redis://from-env:6379",
        },
        rows,
      ),
    ).toMatchObject({
      REDIS_URL: "redis://from-env:6379",
      QDRANT_URL: "http://from-db:6333",
      ANTHROPIC_BASE_URL: "https://api.anthropic.com",
      S3_ENDPOINT: "http://localhost:9000",
    });
  });

  it("merges resolved system settings back into the runtime environment", () => {
    expect(
      buildRuntimeEnvironment(
        {
          DATABASE_URL: "postgres://postgres:postgres@localhost:5432/knowledge_assistant",
        },
        [
          {
            settingKey: "app_url",
            valueText: "http://127.0.0.1:3000",
          },
        ],
      ),
    ).toMatchObject({
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/knowledge_assistant",
      APP_URL: "http://127.0.0.1:3000",
      REDIS_URL: "redis://localhost:6379",
    });
  });
});
