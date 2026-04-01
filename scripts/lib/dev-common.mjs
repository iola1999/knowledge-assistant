import os from "node:os";
import fs from "node:fs";
import fsp from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  listMissingRequiredEnvNames,
  normalizeEnvExampleContent,
  parseEnvText,
  parseInfrastructureTargets,
  parseRuntimeEndpoints,
  selectDevEnvFile,
} from "./dev-env.mjs";
import { runDbUpgradeCommand } from "./upgrade-common.mjs";
import { buildRuntimeEnvironment } from "./system-settings.mjs";

const libDir = path.dirname(fileURLToPath(import.meta.url));
const MANAGED_DEV_ROOT_NAME = "anchordesk-dev";

export const repoRoot = path.resolve(libDir, "../..");

export function resolveTmpRoot({
  platform = process.platform,
  tmpDir = os.tmpdir(),
} = {}) {
  return platform === "win32" ? tmpDir : "/tmp";
}

export function resolveDevLogRoot({
  tmpRoot = resolveTmpRoot(),
} = {}) {
  return path.join(tmpRoot, MANAGED_DEV_ROOT_NAME);
}

export function resolvePidRoot(options = {}) {
  return path.join(resolveDevLogRoot(options), "pids");
}

export const devRoot = resolveDevLogRoot();
export const logDir = path.join(resolveDevLogRoot(), "logs");
export const pidDir = resolvePidRoot();

const envExamplePath = path.join(repoRoot, ".env.example");
const envLocalPath = path.join(repoRoot, ".env.local");
const envPath = path.join(repoRoot, ".env");
const nodeModulesPath = path.join(repoRoot, "node_modules");
const pythonRequirementsPath = path.join(
  repoRoot,
  "services",
  "parser",
  "requirements.txt",
);
const pythonRequirementsStampPath = path.join(
  repoRoot,
  ".venv",
  ".parser-requirements.sha256",
);
const MANAGED_SERVICE_STATE = {
  UNMANAGED: "unmanaged",
  STOPPED: "stopped",
  RUNNING: "running",
  STALE_UNMANAGED: "stale_unmanaged",
  STALE: "stale",
};

function resolvePythonBinary() {
  if (process.platform === "win32") {
    return path.join(repoRoot, ".venv", "Scripts", "python.exe");
  }

  return path.join(repoRoot, ".venv", "bin", "python");
}

function resolvePnpmBinary() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function normalizeCheckHost(host) {
  if (host === "0.0.0.0") {
    return "127.0.0.1";
  }

  return host;
}

export function getManagedServices(env) {
  const endpoints = parseRuntimeEndpoints(env);
  const pnpm = resolvePnpmBinary();

  return [
    {
      id: "parser",
      name: "Parser service",
      cwd: path.join(repoRoot, "services", "parser"),
      command: resolvePythonBinary(),
      args: [
        "-m",
        "uvicorn",
        "main:app",
        "--host",
        endpoints.parser.host,
        "--port",
        String(endpoints.parser.port),
      ],
      host: endpoints.parser.host,
      port: endpoints.parser.port,
      healthUrl: `${endpoints.parser.url.replace(/\/$/u, "")}/health`,
    },
    {
      id: "agent",
      name: "Agent runtime",
      cwd: repoRoot,
      command: pnpm,
      args: ["--filter", "@anchordesk/agent-runtime", "dev"],
      envOverrides: {
        PORT: String(endpoints.agent.port),
      },
      host: endpoints.agent.host,
      port: endpoints.agent.port,
      healthUrl: `${endpoints.agent.url.replace(/\/$/u, "")}/health`,
    },
    {
      id: "worker",
      name: "Worker",
      cwd: repoRoot,
      command: pnpm,
      args: ["--filter", "@anchordesk/worker", "dev"],
    },
    {
      id: "web",
      name: "Web app",
      cwd: path.join(repoRoot, "apps", "web"),
      command: pnpm,
      args: [
        "exec",
        "next",
        "dev",
        "--hostname",
        endpoints.app.host,
        "--port",
        String(endpoints.app.port),
      ],
      host: endpoints.app.host,
      port: endpoints.app.port,
    },
  ];
}

function getPidRecordPath(serviceId) {
  return path.join(pidDir, `${serviceId}.json`);
}

export function getLogPath(serviceId) {
  return path.join(logDir, `${serviceId}.log`);
}

export async function ensureDevDirectories() {
  await fsp.mkdir(logDir, { recursive: true });
  await fsp.mkdir(pidDir, { recursive: true });
}

export async function resetDevLogDirectory(targetLogDir = logDir) {
  await fsp.rm(targetLogDir, { recursive: true, force: true });
  await fsp.mkdir(targetLogDir, { recursive: true });
}

export async function pathExists(targetPath) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function computeFileSha256(targetPath) {
  const content = await fsp.readFile(targetPath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function readTrimmedFile(targetPath) {
  try {
    return (await fsp.readFile(targetPath, "utf8")).trim();
  } catch {
    return null;
  }
}

export async function ensureToolingInstalled(options = {}) {
  const nodeModulesPathToCheck = options.nodeModulesPath ?? nodeModulesPath;
  const pythonBinaryPath = options.pythonBinaryPath ?? resolvePythonBinary();
  const pythonRequirementsPathToCheck =
    options.pythonRequirementsPath ?? pythonRequirementsPath;
  const pythonRequirementsStampPathToCheck =
    options.pythonRequirementsStampPath ?? pythonRequirementsStampPath;
  const log = options.log ?? console.log;
  const runCommandFn = options.runCommand ?? runCommand;

  if (!(await pathExists(nodeModulesPathToCheck))) {
    log("node_modules not found, running pnpm install...");
    await runCommandFn({
      command: resolvePnpmBinary(),
      args: ["install"],
      cwd: repoRoot,
    });
  }

  const pythonBinaryExists = await pathExists(pythonBinaryPath);
  const requirementsHash = await computeFileSha256(pythonRequirementsPathToCheck);
  const recordedRequirementsHash = await readTrimmedFile(
    pythonRequirementsStampPathToCheck,
  );

  if (!pythonBinaryExists || recordedRequirementsHash !== requirementsHash) {
    if (!pythonBinaryExists) {
      log(".venv not found, running pnpm setup:python...");
    } else if (!recordedRequirementsHash) {
      log(
        "parser dependency stamp not found, running pnpm setup:python to refresh .venv...",
      );
    } else {
      log(
        "services/parser/requirements.txt changed, running pnpm setup:python to refresh .venv...",
      );
    }

    await runCommandFn({
      command: resolvePnpmBinary(),
      args: ["setup:python"],
      cwd: repoRoot,
    });

    await fsp.mkdir(path.dirname(pythonRequirementsStampPathToCheck), {
      recursive: true,
    });
    await fsp.writeFile(
      pythonRequirementsStampPathToCheck,
      `${requirementsHash}\n`,
      "utf8",
    );
  }
}

export async function loadDevEnvironment(options = {}) {
  const createIfMissing = options.createIfMissing ?? true;
  const envLocalExists = await pathExists(envLocalPath);
  const envExists = await pathExists(envPath);
  let envFileName = selectDevEnvFile({ envLocalExists, envExists });
  let created = false;

  if (!envFileName && createIfMissing) {
    const exampleContent = await fsp.readFile(envExamplePath, "utf8");
    await fsp.writeFile(
      envLocalPath,
      normalizeEnvExampleContent(exampleContent),
      "utf8",
    );
    envFileName = ".env.local";
    created = true;
  }

  const envFilePath =
    envFileName === ".env.local"
      ? envLocalPath
      : envFileName === ".env"
        ? envPath
        : null;
  const envFromFile = envFilePath
    ? parseEnvText(await fsp.readFile(envFilePath, "utf8"))
    : {};

  return {
    env: {
      ...envFromFile,
      ...process.env,
    },
    envFileName,
    envFilePath,
    created,
  };
}

export function assertRequiredEnvironment(
  env,
  requiredNames = ["DATABASE_URL", "AUTH_SECRET"],
) {
  const missing = listMissingRequiredEnvNames(env, requiredNames);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

export async function isPortOpen(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, normalizeCheckHost(host));
  });
}

export async function verifyInfrastructure(env) {
  const results = [];

  for (const target of parseInfrastructureTargets(env)) {
    const ok = await isPortOpen(target.host, target.port);
    results.push({
      ...target,
      ok,
    });
  }

  const failures = results.filter((result) => !result.ok);
  if (failures.length > 0) {
    const details = failures
      .map(
        (failure) =>
          `- ${failure.name}: ${failure.host}:${failure.port} (${failure.envName})`,
      )
      .join("\n");

    throw new Error(
      `Required local infrastructure is not reachable.\n${details}\nPlease run pnpm infra:up or start these services manually, then rerun pnpm dev.`,
    );
  }

  return results;
}

export async function runCommand(input) {
  await new Promise((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: input.env ?? process.env,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${input.command} ${input.args.join(" ")} exited with code ${code ?? "unknown"}`,
        ),
      );
    });
  });
}

export async function runCommandCapture(input) {
  return await new Promise((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: input.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }

      reject(
        new Error(
          stderr.trim() ||
            `${input.command} ${input.args.join(" ")} exited with code ${code ?? "unknown"}`,
        ),
      );
    });
  });
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

export async function ensureDevDatabase(env) {
  await runDbUpgradeCommand(["--mode=apply-safe-blocking"], { env });
}

export async function loadResolvedSystemEnvironment(
  env,
  options = {},
) {
  const buildRuntimeEnvironmentFn =
    options.buildRuntimeEnvironment ?? buildRuntimeEnvironment;
  const runCommandCaptureFn = options.runCommandCapture ?? runCommandCapture;
  const pnpmBinary = options.pnpmBinary ?? resolvePnpmBinary();
  const fallbackEnv = buildRuntimeEnvironmentFn(env);

  try {
    const output = await runCommandCaptureFn({
      command: pnpmBinary,
      args: [
        "--filter",
        "@anchordesk/db",
        "exec",
        "node",
        "scripts/print-system-env.mjs",
      ],
      cwd: repoRoot,
      // Important: do not prefill module defaults here. Otherwise
      // print-system-env will treat those defaults as explicit env vars
      // and DB-backed settings will never win.
      env,
    });

    if (!output) {
      return fallbackEnv;
    }

    return {
      ...fallbackEnv,
      ...JSON.parse(output),
    };
  } catch {
    return fallbackEnv;
  }
}

export async function ensureDevBucket(env) {
  await runCommand({
    command: resolvePnpmBinary(),
    args: [
      "--filter",
      "@anchordesk/storage",
      "exec",
      "node",
      "scripts/ensure-dev-bucket.mjs",
    ],
    cwd: repoRoot,
    env,
  });
}

export function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

export async function readPidRecord(serviceId) {
  try {
    const content = await fsp.readFile(getPidRecordPath(serviceId), "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function writePidRecord(serviceId, record) {
  await fsp.writeFile(
    getPidRecordPath(serviceId),
    `${JSON.stringify(record, null, 2)}\n`,
    "utf8",
  );
}

export async function removePidRecord(serviceId) {
  await fsp.rm(getPidRecordPath(serviceId), { force: true });
}

async function waitForHttpOk(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Ignore transient startup failures.
    }

    await sleep(500);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function isHttpOk(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForTcpPort(host, port, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await isPortOpen(host, port)) {
      return;
    }

    await sleep(500);
  }

  throw new Error(`Timed out waiting for ${host}:${port}`);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function startManagedService(service, env) {
  const existing = await readPidRecord(service.id);
  if (existing?.pid && isProcessRunning(existing.pid)) {
    return { started: false, pid: existing.pid };
  }

  await removePidRecord(service.id);

  if (service.port && (await isPortOpen(service.host, service.port))) {
    throw new Error(
      `${service.name} could not be started because ${service.host}:${service.port} is already in use.`,
    );
  }

  const logPath = getLogPath(service.id);
  const logFd = fs.openSync(logPath, "a");
  fs.writeSync(
    logFd,
    `\n[${new Date().toISOString()}] starting ${service.name}: ${service.command} ${service.args.join(" ")}\n`,
  );

  const child = spawn(service.command, service.args, {
    cwd: service.cwd,
    env: {
      ...env,
      ...service.envOverrides,
    },
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });

  fs.closeSync(logFd);
  child.unref();

  await writePidRecord(service.id, {
    pid: child.pid,
    startedAt: new Date().toISOString(),
    logPath,
    command: [service.command, ...service.args].join(" "),
  });

  try {
    if (service.healthUrl) {
      await waitForHttpOk(service.healthUrl);
    } else if (service.port) {
      await waitForTcpPort(service.host, service.port);
    } else {
      await sleep(1_500);
      if (!isProcessRunning(child.pid)) {
        throw new Error(`${service.name} exited during startup`);
      }
    }
  } catch (error) {
    await stopManagedService(service.id);
    const recentLog = await readRecentLogLines(logPath);
    const message =
      error instanceof Error ? error.message : "Unknown startup error";
    throw new Error(
      `${message}\nRecent log output:\n${recentLog || "(no log output yet)"}`,
    );
  }

  // Give the process a short grace window so quick-start/quick-exit processes
  // are treated as startup failures instead of "ready" ghosts.
  await sleep(750);
  if (!isProcessRunning(child.pid)) {
    await stopManagedService(service.id);
    const recentLog = await readRecentLogLines(logPath);
    throw new Error(
      `${service.name} exited shortly after startup.\nRecent log output:\n${recentLog || "(no log output yet)"}`,
    );
  }

  return { started: true, pid: child.pid };
}

export async function getManagedServiceStatus(service) {
  const record = await readPidRecord(service.id);
  const portLabel =
    service.port && service.host ? `, port ${service.host}:${service.port}` : "";

  const reachable = service.healthUrl
    ? await isHttpOk(service.healthUrl)
    : service.port && service.host
      ? await isPortOpen(service.host, service.port)
      : false;

  if (!record) {
    return {
      state: reachable
        ? MANAGED_SERVICE_STATE.UNMANAGED
        : MANAGED_SERVICE_STATE.STOPPED,
      detail: `${reachable ? "running (unmanaged)" : "not running"}${portLabel}`,
    };
  }

  const running = record.pid ? isProcessRunning(record.pid) : false;
  if (running) {
    return {
      state: MANAGED_SERVICE_STATE.RUNNING,
      detail: `running (pid ${record.pid}${portLabel}, log ${getLogPath(service.id)})`,
    };
  }

  return {
    state: reachable
      ? MANAGED_SERVICE_STATE.STALE_UNMANAGED
      : MANAGED_SERVICE_STATE.STALE,
    detail: `${
      reachable ? "stale pid / running unmanaged" : "stale pid"
    } (pid ${record.pid}${portLabel}, log ${getLogPath(service.id)})`,
  };
}

export async function stopManagedService(serviceId) {
  const record = await readPidRecord(serviceId);
  if (!record?.pid) {
    await removePidRecord(serviceId);
    return false;
  }

  if (!isProcessRunning(record.pid)) {
    await removePidRecord(serviceId);
    return false;
  }

  try {
    if (process.platform === "win32") {
      process.kill(record.pid, "SIGTERM");
    } else {
      process.kill(-record.pid, "SIGTERM");
    }
  } catch (error) {
    if (error?.code !== "ESRCH") {
      throw error;
    }
  }

  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (!isProcessRunning(record.pid)) {
      await removePidRecord(serviceId);
      return true;
    }

    await sleep(250);
  }

  try {
    if (process.platform === "win32") {
      process.kill(record.pid, "SIGKILL");
    } else {
      process.kill(-record.pid, "SIGKILL");
    }
  } catch (error) {
    if (error?.code !== "ESRCH") {
      throw error;
    }
  }

  await removePidRecord(serviceId);
  return true;
}

export async function readRecentLogLines(logPath, lineCount = 20) {
  try {
    const content = await fsp.readFile(logPath, "utf8");
    return content.split(/\r?\n/u).slice(-lineCount).join("\n").trim();
  } catch {
    return "";
  }
}
