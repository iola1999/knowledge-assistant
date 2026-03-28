import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

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

async function hasUsersTable() {
  const client = new Client({
    connectionString: getDatabaseUrl(),
  });

  await client.connect();

  try {
    const result = await client.query(
      "select to_regclass('public.users') as table_name",
    );
    return result.rows[0]?.table_name === "users";
  } finally {
    await client.end();
  }
}

async function runDrizzlePush() {
  await runCommand(["exec", "drizzle-kit", "push", "--force"]);
}

async function ensureSystemSettings() {
  await runCommand(["exec", "node", "scripts/ensure-system-settings.mjs"]);
}

async function runCommand(args) {
  await new Promise((resolve, reject) => {
    const child = spawn(pnpmCommand, args, {
      cwd: packageRoot,
      env: process.env,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${args.join(" ")} exited with code ${code ?? "unknown"}`));
    });
  });
}

async function main() {
  if (await hasUsersTable()) {
    console.log("Database schema already present.");
    await ensureSystemSettings();
    return;
  }

  console.log("Database schema missing, applying drizzle-kit push...");
  await runDrizzlePush();

  if (!(await hasUsersTable())) {
    throw new Error("Database schema bootstrap finished, but users table is still missing.");
  }

  console.log("Database schema is ready.");
  await ensureSystemSettings();
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
