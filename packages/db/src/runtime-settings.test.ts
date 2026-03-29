import { afterEach, describe, expect, it } from "vitest";

import {
  applySettingsToProcessEnv,
  _resetRuntimeSettingsForTest,
} from "./runtime-settings";

afterEach(() => {
  _resetRuntimeSettingsForTest();
});

describe("applySettingsToProcessEnv", () => {
  const savedEnv: Record<string, string | undefined> = {};

  function setEnv(key: string, value: string | undefined) {
    savedEnv[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("injects DB values into process.env when env is not set", () => {
    setEnv("REDIS_URL", undefined);
    setEnv("QDRANT_URL", undefined);

    applySettingsToProcessEnv([
      { setting_key: "redis_url", value_text: "redis://from-db:6379" },
      { setting_key: "qdrant_url", value_text: "http://from-db:6333" },
    ]);

    expect(process.env.REDIS_URL).toBe("redis://from-db:6379");
    expect(process.env.QDRANT_URL).toBe("http://from-db:6333");
  });

  it("does not overwrite existing env values", () => {
    setEnv("S3_ENDPOINT", "http://from-env:9000");

    applySettingsToProcessEnv([
      { setting_key: "s3_endpoint", value_text: "http://from-db:9000" },
    ]);

    expect(process.env.S3_ENDPOINT).toBe("http://from-env:9000");
  });

  it("skips rows with empty value_text", () => {
    setEnv("ANTHROPIC_API_KEY", undefined);

    applySettingsToProcessEnv([
      { setting_key: "anthropic_api_key", value_text: "" },
    ]);

    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("skips rows with null value_text", () => {
    setEnv("EMBEDDING_MODEL", undefined);

    applySettingsToProcessEnv([
      { setting_key: "embedding_model", value_text: null },
    ]);

    expect(process.env.EMBEDDING_MODEL).toBeUndefined();
  });

  it("converts setting_key to uppercase for env name", () => {
    setEnv("S3_FORCE_PATH_STYLE", undefined);

    applySettingsToProcessEnv([
      { setting_key: "s3_force_path_style", value_text: "true" },
    ]);

    expect(process.env.S3_FORCE_PATH_STYLE).toBe("true");
  });
});
