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
    });

    expect(rows.find((row) => row.settingKey === "redis_url")).toMatchObject({
      settingKey: "redis_url",
      valueText: "redis://custom:6379",
      isSecret: false,
    });
    expect(rows.find((row) => row.settingKey === "anthropic_api_key")).toMatchObject({
      settingKey: "anthropic_api_key",
      valueText: "secret-key",
      isSecret: true,
    });
    expect(rows.find((row) => row.settingKey === "qdrant_collection")).toMatchObject({
      settingKey: "qdrant_collection",
      valueText: "legal_chunks",
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
      S3_ENDPOINT: "http://localhost:9000",
    });
  });

  it("merges resolved system settings back into the runtime environment", () => {
    expect(
      buildRuntimeEnvironment(
        {
          DATABASE_URL: "postgres://postgres:postgres@localhost:5432/law_doc",
        },
        [
          {
            settingKey: "app_url",
            valueText: "http://127.0.0.1:3000",
          },
        ],
      ),
    ).toMatchObject({
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/law_doc",
      APP_URL: "http://127.0.0.1:3000",
      REDIS_URL: "redis://localhost:6379",
    });
  });
});
