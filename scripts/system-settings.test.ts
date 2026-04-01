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
      BRAVE_SEARCH_API_KEY: "brave-secret",
    });

    expect(rows.find((row) => row.settingKey === "redis_url")).toMatchObject({
      settingKey: "redis_url",
      valueText: "redis://custom:6379",
      isSecret: false,
      summary: "BullMQ 与会话 allowlist 使用的 Redis 地址。",
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
    expect(
      rows.find((row) => row.settingKey === "anthropic_final_answer_max_tokens"),
    ).toMatchObject({
      settingKey: "anthropic_final_answer_max_tokens",
      valueText: "1400",
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
    expect(
      rows.find((row) => row.settingKey === "agent_runtime_respond_worker_concurrency"),
    ).toMatchObject({
      settingKey: "agent_runtime_respond_worker_concurrency",
      valueText: "1",
      isSecret: false,
    });
    expect(rows.find((row) => row.settingKey === "fetch_source_max_concurrency")).toMatchObject({
      settingKey: "fetch_source_max_concurrency",
      valueText: "3",
      isSecret: false,
    });
    expect(rows.find((row) => row.settingKey === "parser_ocr_provider")).toMatchObject({
      settingKey: "parser_ocr_provider",
      valueText: "dashscope",
      isSecret: false,
    });
    expect(rows.find((row) => row.settingKey === "parser_ocr_dashscope_model")).toMatchObject({
      settingKey: "parser_ocr_dashscope_model",
      valueText: "qwen-vl-ocr-latest",
      isSecret: false,
    });
    expect(rows.find((row) => row.settingKey === "parser_ocr_dashscope_task")).toMatchObject({
      settingKey: "parser_ocr_dashscope_task",
      valueText: "advanced_recognition",
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
          settingKey: "anthropic_final_answer_max_tokens",
          valueText: "1600",
        },
      ]),
    ).toEqual({
      S3_BUCKET: "custom-bucket",
      ANTHROPIC_FINAL_ANSWER_MAX_TOKENS: "1600",
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
      S3_ENDPOINT: "http://localhost:9000",
    });
  });

  it("merges resolved system settings back into the runtime environment", () => {
    expect(
      buildRuntimeEnvironment(
        {
          DATABASE_URL: "postgres://postgres:postgres@localhost:5432/anchor_desk",
        },
        [
          {
            settingKey: "app_url",
            valueText: "http://127.0.0.1:3000",
          },
        ],
      ),
    ).toMatchObject({
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/anchor_desk",
      APP_URL: "http://127.0.0.1:3000",
      REDIS_URL: "redis://localhost:6379",
    });
  });
});
