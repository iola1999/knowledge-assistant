import pg from "pg";

import { buildRuntimeEnvironment } from "../../../scripts/lib/system-settings.mjs";

const { Client } = pg;

/**
 * @typedef {{ settingKey: string, valueText: string | null }} SystemSettingRow
 */

/**
 * @typedef {{
 *   connect: () => Promise<unknown>,
 *   query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }>,
 *   end: () => Promise<unknown>,
 * }} RuntimeSettingsClient
 */

/**
 * @typedef {(connectionString: string) => RuntimeSettingsClient} RuntimeSettingsClientFactory
 */

export function readDatabaseUrl(env = process.env) {
  const value = env.DATABASE_URL?.trim();
  return value ? value : null;
}

/**
 * @param {RuntimeSettingsClient} client
 * @returns {Promise<SystemSettingRow[]>}
 */
export async function loadSystemSettingRows(client) {
  const tableCheck = await client.query(
    "select to_regclass('public.system_settings') as table_name",
  );

  if (tableCheck.rows[0]?.["table_name"] !== "system_settings") {
    return [];
  }

  const result = await client.query(
    `
      select
        setting_key as "settingKey",
        value_text as "valueText"
      from system_settings
    `,
  );

  return /** @type {SystemSettingRow[]} */ (Array.isArray(result.rows) ? result.rows : []);
}

/**
 * @param {{
 *   env?: Record<string, string | undefined>,
 *   createClient?: RuntimeSettingsClientFactory,
 *   logWarning?: (message: string, error: unknown) => void,
 * }} [options]
 */
export async function applyDatabaseRuntimeSettings({
  env = process.env,
  createClient = (connectionString) => new Client({ connectionString }),
  logWarning = (message, error) => {
    console.warn(message, error instanceof Error ? error.message : error);
  },
} = {}) {
  const databaseUrl = readDatabaseUrl(env);
  if (!databaseUrl) {
    return {
      ok: false,
      reason: "missing_database_url",
    };
  }

  const client = createClient(databaseUrl);

  try {
    await client.connect();
    const rows = await loadSystemSettingRows(client);
    Object.assign(env, buildRuntimeEnvironment(env, rows));

    return {
      ok: true,
      rowCount: rows.length,
    };
  } catch (error) {
    logWarning("[runtime-settings] Failed to load system settings from database:", error);
    return {
      ok: false,
      reason: "load_failed",
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}
