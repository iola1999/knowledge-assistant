import { getPool } from "./client";

let initialized = false;

/**
 * Given system_settings rows, inject non-empty values into process.env
 * for keys not already set.
 *
 * Priority: explicit env var > DB value > module-level default.
 */
export function applySettingsToProcessEnv(
  rows: Array<{ setting_key: string; value_text: string | null }>,
): void {
  for (const row of rows) {
    const envName = row.setting_key.toUpperCase();
    const value = row.value_text ?? "";

    // Only inject non-empty DB values when env is not already set
    if (value && process.env[envName] === undefined) {
      process.env[envName] = value;
    }
  }
}

/**
 * Load system_settings from the database and inject non-empty values
 * into process.env for keys not already set.
 *
 * Must be called once at application startup, before any lazy singletons
 * (S3, Redis, Qdrant, Anthropic clients) are initialized.
 *
 * If the database is unreachable or the table does not exist, the app
 * continues with whatever env and module defaults provide.
 */
export async function initRuntimeSettings(): Promise<void> {
  if (initialized) return;

  try {
    const pool = getPool();

    const tableCheck = await pool.query(
      "select to_regclass('public.system_settings') as table_name",
    );
    if (tableCheck.rows[0]?.table_name !== "system_settings") {
      initialized = true;
      return;
    }

    const result = await pool.query<{
      setting_key: string;
      value_text: string | null;
    }>("select setting_key, value_text from system_settings");

    applySettingsToProcessEnv(result.rows);
  } catch (error) {
    console.warn(
      "[runtime-settings] Failed to load system settings from database:",
      error instanceof Error ? error.message : error,
    );
  }

  initialized = true;
}

export function isRuntimeSettingsInitialized(): boolean {
  return initialized;
}

/** Reset state — test only. */
export function _resetRuntimeSettingsForTest(): void {
  initialized = false;
}
