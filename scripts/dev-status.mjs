import {
  ensureSystemSettings,
  formatError,
  getLogPath,
  getManagedServices,
  isPortOpen,
  isProcessRunning,
  loadDevEnvironment,
  loadResolvedSystemEnvironment,
  readPidRecord,
} from "./lib/dev-common.mjs";
import { parseInfrastructureTargets } from "./lib/dev-env.mjs";

async function main() {
  const { env, envFileName } = await loadDevEnvironment({ createIfMissing: false });
  await ensureSystemSettings(env, { ignoreErrors: true });
  const runtimeEnv = await loadResolvedSystemEnvironment(env);

  console.log(`Environment source: ${envFileName ?? "shell variables + built-in defaults"}`);
  console.log("");
  console.log("Infrastructure:");

  try {
    for (const target of parseInfrastructureTargets(runtimeEnv)) {
      const ok = await isPortOpen(target.host, target.port);
      console.log(
        `- ${target.name}: ${ok ? "reachable" : "missing"} (${target.host}:${target.port})`,
      );
    }
  } catch (error) {
    console.log(
      `- Unable to resolve infrastructure targets: ${formatError(error)}`,
    );
  }

  console.log("");
  console.log("Managed services:");

  for (const service of getManagedServices(runtimeEnv)) {
    const record = await readPidRecord(service.id);
    const running = record?.pid ? isProcessRunning(record.pid) : false;
    const portLabel =
      service.port && service.host ? `, port ${service.host}:${service.port}` : "";

    if (!record) {
      console.log(`- ${service.name}: not managed${portLabel}`);
      continue;
    }

    console.log(
      `- ${service.name}: ${running ? "running" : "stale pid"} (pid ${record.pid}${portLabel}, log ${getLogPath(service.id)})`,
    );
  }
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
