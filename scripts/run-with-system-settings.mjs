import path from "node:path";
import { spawn } from "node:child_process";

import {
  assertRequiredEnvironment,
  ensureDevDatabase,
  formatError,
  loadDevEnvironment,
  loadResolvedSystemEnvironment,
  repoRoot,
} from "./lib/dev-common.mjs";

function parseArgs(argv) {
  const args = [...argv];
  let cwd = repoRoot;
  let requiredEnvNames = [];

  if (args[0] === "--cwd") {
    const cwdArg = args[1];
    if (!cwdArg) {
      throw new Error("--cwd requires a path argument");
    }

    cwd = path.resolve(repoRoot, cwdArg);
    args.splice(0, 2);
  }

  if (args[0] === "--require-env") {
    const namesArg = args[1];
    if (!namesArg) {
      throw new Error("--require-env requires a comma-separated value");
    }

    requiredEnvNames = namesArg
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    args.splice(0, 2);
  }

  if (args[0] === "--") {
    args.shift();
  }

  if (args.length === 0) {
    throw new Error("No command was provided");
  }

  return {
    cwd,
    command: args[0],
    commandArgs: args.slice(1),
    requiredEnvNames,
  };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const { env } = await loadDevEnvironment();

  if (parsed.requiredEnvNames.length > 0) {
    assertRequiredEnvironment(env, parsed.requiredEnvNames);
  }

  await ensureDevDatabase(env);
  const runtimeEnv = await loadResolvedSystemEnvironment(env);

  const child = spawn(parsed.command, parsed.commandArgs, {
    cwd: parsed.cwd,
    env: runtimeEnv,
    stdio: "inherit",
  });

  child.once("error", (error) => {
    console.error(formatError(error));
    process.exit(1);
  });

  child.once("close", (code) => {
    process.exit(code ?? 1);
  });
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
