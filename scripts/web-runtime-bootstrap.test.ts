import { describe, expect, it, vi } from "vitest";

import { applyDatabaseRuntimeSettings } from "../packages/db/scripts/runtime-settings-bootstrap.mjs";

describe("applyDatabaseRuntimeSettings", () => {
  it("loads Redis and default runtime settings from the database", async () => {
    const env: Record<string, string | undefined> = {
      DATABASE_URL: "postgres://postgres:postgres@postgres:5432/anchor_desk",
    };
    const connect = vi.fn().mockResolvedValue(undefined);
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ table_name: "system_settings" }],
      })
      .mockResolvedValueOnce({
        rows: [{ settingKey: "redis_url", valueText: "redis://redis:6379" }],
      });
    const end = vi.fn().mockResolvedValue(undefined);

    const result = await applyDatabaseRuntimeSettings({
      env,
      createClient: () => ({ connect, query, end }),
      logWarning: vi.fn(),
    });

    expect(result).toEqual({
      ok: true,
      rowCount: 1,
    });
    expect(env.REDIS_URL).toBe("redis://redis:6379");
    expect(env.QDRANT_URL).toBe("http://localhost:6333");
    expect(connect).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("keeps explicit env values over database rows", async () => {
    const env: Record<string, string | undefined> = {
      DATABASE_URL: "postgres://postgres:postgres@postgres:5432/anchor_desk",
      REDIS_URL: "redis://from-env:6379",
    };

    await applyDatabaseRuntimeSettings({
      env,
      createClient: () => ({
        connect: vi.fn().mockResolvedValue(undefined),
        query: vi
          .fn()
          .mockResolvedValueOnce({
            rows: [{ table_name: "system_settings" }],
          })
          .mockResolvedValueOnce({
            rows: [{ settingKey: "redis_url", valueText: "redis://redis:6379" }],
          }),
        end: vi.fn().mockResolvedValue(undefined),
      }),
      logWarning: vi.fn(),
    });

    expect(env.REDIS_URL).toBe("redis://from-env:6379");
  });

  it("skips database access when DATABASE_URL is missing", async () => {
    const createClient = vi.fn();

    const result = await applyDatabaseRuntimeSettings({
      env: {},
      createClient,
      logWarning: vi.fn(),
    });

    expect(result).toEqual({
      ok: false,
      reason: "missing_database_url",
    });
    expect(createClient).not.toHaveBeenCalled();
  });
});
