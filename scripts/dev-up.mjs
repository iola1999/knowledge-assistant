import {
  assertRequiredEnvironment,
  ensureDevBucket,
  ensureDevDatabase,
  ensureDevDirectories,
  ensureToolingInstalled,
  formatError,
  getManagedServices,
  logDir,
  loadDevEnvironment,
  loadResolvedSystemEnvironment,
  stopManagedService,
  verifyInfrastructure,
  startManagedService,
} from "./lib/dev-common.mjs";
import { parseRuntimeEndpoints } from "./lib/dev-env.mjs";

async function main() {
  await ensureDevDirectories();
  await ensureToolingInstalled();

  const { env, envFileName, envFilePath, created } = await loadDevEnvironment();

  if (created) {
    console.log(`Created ${envFileName} from .env.example.`);
  }

  if (envFilePath) {
    console.log(`Using environment file: ${envFileName}`);
  } else {
    console.log("No .env or .env.local found; using shell environment and built-in defaults.");
  }

  assertRequiredEnvironment(env, ["DATABASE_URL", "AUTH_SECRET"]);
  await ensureDevDatabase(env);
  const runtimeEnv = await loadResolvedSystemEnvironment(env);
  const endpoints = parseRuntimeEndpoints(runtimeEnv);
  await verifyInfrastructure(runtimeEnv);
  await ensureDevBucket(runtimeEnv);

  const services = getManagedServices(runtimeEnv);
  const startedNow = [];

  try {
    for (const service of services) {
      const result = await startManagedService(service, runtimeEnv);
      console.log(
        `${result.started ? "Started" : "Already running"} ${service.name}${result.pid ? ` (pid ${result.pid})` : ""}.`,
      );

      if (result.started) {
        startedNow.push(service.id);
      }
    }
  } catch (error) {
    console.error(formatError(error) || "Failed to start development services.");

    for (const serviceId of startedNow.reverse()) {
      await stopManagedService(serviceId);
    }

    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log("Development services are ready:");
  console.log(`- Web app: ${endpoints.app.url}`);
  console.log(`- Agent runtime: ${endpoints.agent.url}`);
  console.log(`- Parser service: ${endpoints.parser.url}`);
  console.log(`- Logs: ${logDir}`);
  console.log("Use pnpm dev:status to inspect processes and pnpm dev:down to stop them.");
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
