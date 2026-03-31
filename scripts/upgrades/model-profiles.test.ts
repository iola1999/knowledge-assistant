import { describe, expect, it } from "vitest";

import { modelProfilesUpgrade } from "./model-profiles.mjs";

describe("modelProfilesUpgrade", () => {
  it("creates a default model profile from legacy anthropic settings and backfills conversations", async () => {
    const calls = [];
    const client = {
      async query(sql, params = []) {
        calls.push({ sql, params });

        if (sql.includes("from llm_model_profiles") && sql.includes("is_default = true")) {
          return { rows: [], rowCount: 0 };
        }

        if (sql.includes("from llm_model_profiles") && sql.includes("order by created_at asc")) {
          return { rows: [], rowCount: 0 };
        }

        if (sql.includes("from system_settings")) {
          return {
            rows: [
              { setting_key: "anthropic_api_key", value_text: "sk-legacy" },
              {
                setting_key: "anthropic_base_url",
                value_text: "https://anthropic-proxy.example.com",
              },
              { setting_key: "anthropic_model", value_text: "claude-sonnet-4-5" },
            ],
            rowCount: 3,
          };
        }

        if (sql.includes("insert into llm_model_profiles")) {
          return { rows: [{ id: "profile-1" }], rowCount: 1 };
        }

        if (sql.includes("update conversations")) {
          return { rows: [], rowCount: 7 };
        }

        if (sql.includes("delete from system_settings")) {
          return { rows: [], rowCount: 4 };
        }

        return { rows: [], rowCount: 0 };
      },
    };

    const result = await modelProfilesUpgrade.run({
      client,
      env: {},
    });

    expect(calls.some((call) => call.sql.includes("insert into llm_model_profiles"))).toBe(
      true,
    );
    expect(calls.some((call) => call.sql.includes("update conversations"))).toBe(true);
    expect(calls.some((call) => call.sql.includes("delete from system_settings"))).toBe(
      true,
    );
    expect(result).toEqual({
      defaultModelProfileId: "profile-1",
      createdDefaultProfile: true,
      promotedExistingProfile: false,
      conversationsBackfilled: 7,
      removedLegacySettings: 3,
    });
  });

  it("reuses an existing default model profile without inserting a duplicate", async () => {
    const calls = [];
    const client = {
      async query(sql, params = []) {
        calls.push({ sql, params });

        if (sql.includes("from llm_model_profiles") && sql.includes("is_default = true")) {
          return { rows: [{ id: "profile-existing" }], rowCount: 1 };
        }

        if (sql.includes("update conversations")) {
          return { rows: [], rowCount: 3 };
        }

        if (sql.includes("delete from system_settings")) {
          return { rows: [], rowCount: 2 };
        }

        return { rows: [], rowCount: 0 };
      },
    };

    const result = await modelProfilesUpgrade.run({
      client,
      env: {},
    });

    expect(calls.some((call) => call.sql.includes("insert into llm_model_profiles"))).toBe(
      false,
    );
    expect(result).toEqual({
      defaultModelProfileId: "profile-existing",
      createdDefaultProfile: false,
      promotedExistingProfile: false,
      conversationsBackfilled: 3,
      removedLegacySettings: 2,
    });
  });
});
