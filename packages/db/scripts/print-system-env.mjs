import pg from "pg";

import { buildRuntimeEnvironment } from "../../../scripts/lib/system-settings.mjs";

const { Client } = pg;

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
      process.stdout.write(`${JSON.stringify(buildRuntimeEnvironment(process.env))}\n`);
      return;
    }

    const result = await client.query(
      `
        select
          setting_key as "settingKey",
          value_text as "valueText"
        from system_settings
      `,
    );

    process.stdout.write(
      `${JSON.stringify(buildRuntimeEnvironment(process.env, result.rows))}\n`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  const message =
    error instanceof Error && error.message ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
