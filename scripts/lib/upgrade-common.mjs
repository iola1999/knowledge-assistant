import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const UPGRADE_MODE = {
  CHECK: "check",
  APPLY_SAFE_BLOCKING: "apply-safe-blocking",
  APPLY_BLOCKING: "apply-blocking",
  APPLY_ALL: "apply-all",
};
const ALL_UPGRADE_MODES = [
  UPGRADE_MODE.CHECK,
  UPGRADE_MODE.APPLY_SAFE_BLOCKING,
  UPGRADE_MODE.APPLY_BLOCKING,
  UPGRADE_MODE.APPLY_ALL,
];

export const APP_UPGRADE_STATUS = {
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
};

const libDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(libDir, "../..");

export function getUpgradeModes() {
  return [...ALL_UPGRADE_MODES];
}

export function formatError(error) {
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

export function parseUpgradeModeArg(argv, options = {}) {
  const allowedModes = options.allowedModes ?? ALL_UPGRADE_MODES;
  const args = [...argv];
  let mode = options.defaultMode;

  while (args.length > 0) {
    const arg = args.shift();
    if (arg?.startsWith("--mode=")) {
      mode = arg.slice("--mode=".length);
      continue;
    }

    if (arg === "--mode") {
      mode = args.shift();
      if (!mode) {
        throw new Error("--mode requires a value");
      }
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!mode) {
    throw new Error(`Missing --mode. Expected one of: ${allowedModes.join(", ")}`);
  }

  if (!allowedModes.includes(mode)) {
    throw new Error(`Invalid --mode: ${mode}. Expected one of: ${allowedModes.join(", ")}`);
  }

  return mode;
}

export function validateUpgradeRegistry(upgrades) {
  if (!Array.isArray(upgrades)) {
    throw new Error("Upgrade registry must be an array");
  }

  const seenKeys = new Set();

  return upgrades.map((upgrade, index) => {
    if (!upgrade || typeof upgrade !== "object") {
      throw new Error(`Upgrade at index ${index} must be an object`);
    }

    if (typeof upgrade.key !== "string" || !upgrade.key) {
      throw new Error(`Upgrade at index ${index} is missing a valid key`);
    }

    if (seenKeys.has(upgrade.key)) {
      throw new Error(`Duplicate upgrade key: ${upgrade.key}`);
    }
    seenKeys.add(upgrade.key);

    if (typeof upgrade.description !== "string" || !upgrade.description) {
      throw new Error(`Upgrade ${upgrade.key} is missing a valid description`);
    }

    if (typeof upgrade.run !== "function") {
      throw new Error(`Upgrade ${upgrade.key} is missing a run() function`);
    }

    return {
      ...upgrade,
      blocking: upgrade.blocking !== false,
      safeInDevStartup: upgrade.safeInDevStartup === true,
    };
  });
}

export function isUpgradeRunnableInMode(upgrade, mode) {
  switch (mode) {
    case UPGRADE_MODE.CHECK:
      return false;
    case UPGRADE_MODE.APPLY_SAFE_BLOCKING:
      return upgrade.blocking && upgrade.safeInDevStartup;
    case UPGRADE_MODE.APPLY_BLOCKING:
      return upgrade.blocking;
    case UPGRADE_MODE.APPLY_ALL:
      return true;
    default:
      throw new Error(`Unsupported upgrade mode: ${mode}`);
  }
}

export function getPendingUpgrades(upgrades, appliedRowsByKey = new Map()) {
  const registry = validateUpgradeRegistry(upgrades);
  return registry.filter(
    (upgrade) =>
      appliedRowsByKey.get(upgrade.key)?.status !== APP_UPGRADE_STATUS.COMPLETED,
  );
}

export function buildUpgradePlan(upgrades, appliedRowsByKey, mode) {
  const pending = getPendingUpgrades(upgrades, appliedRowsByKey);
  return {
    pending,
    runnable: pending.filter((upgrade) => isUpgradeRunnableInMode(upgrade, mode)),
    blockingPending: pending.filter((upgrade) => upgrade.blocking),
    nonBlockingPending: pending.filter((upgrade) => !upgrade.blocking),
  };
}

export function formatUpgradeList(upgrades) {
  if (upgrades.length === 0) {
    return "- none";
  }

  return upgrades
    .map((upgrade) => `- ${upgrade.key} — ${upgrade.description}`)
    .join("\n");
}

function resolvePnpmBinary() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

export async function runDbUpgradeCommand(args, options = {}) {
  const commandArgs = Array.isArray(args) ? args : [args];

  await new Promise((resolve, reject) => {
    const child = spawn(
      resolvePnpmBinary(),
      [
        "--filter",
        "@anchordesk/db",
        "exec",
        "node",
        "scripts/run-upgrades.mjs",
        ...commandArgs,
      ],
      {
        cwd: repoRoot,
        env: options.env ?? process.env,
        stdio: "inherit",
      },
    );

    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Upgrade command exited with code ${code ?? "unknown"}`));
    });
  });
}
