import pg from "pg";

import { buildSystemSettingSeedRows } from "../../../scripts/lib/system-settings.mjs";

const { Client } = pg;

function formatError(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const parts = [];
    if (typeof error.name === "string" && error.name) {
      parts.push(error.name);
    }
    if (typeof error.code === "string" && error.code) {
      parts.push(`(${error.code})`);
    }

    return parts.length > 0 ? parts.join(" ") : JSON.stringify(error);
  }

  return String(error);
}

function getDatabaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL is not configured");
  }

  return value;
}

async function hasSystemSettingsTable(client) {
  const result = await client.query(
    "select to_regclass('public.system_settings') as table_name",
  );
  return result.rows[0]?.table_name === "system_settings";
}

async function main() {
  const client = new Client({
    connectionString: getDatabaseUrl(),
  });

  await client.connect();

  try {
    if (!(await hasSystemSettingsTable(client))) {
      console.log("system_settings table is missing; skipping seed.");
      return;
    }

    const rows = buildSystemSettingSeedRows(process.env);
    for (const row of rows) {
      await client.query(
        `
          insert into system_settings (
            setting_key,
            value_text,
            is_secret,
            description,
            created_at,
            updated_at
          ) values ($1, $2, $3, $4, now(), now())
          on conflict (setting_key) do nothing
        `,
        [row.settingKey, row.valueText, row.isSecret, row.description],
      );
    }

    console.log(`System settings ensured (${rows.length} keys checked).`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
