import {
  formatError,
  getManagedServices,
  loadDevEnvironment,
  loadResolvedSystemEnvironment,
  stopManagedService,
} from "./lib/dev-common.mjs";

async function main() {
  const { env } = await loadDevEnvironment({ createIfMissing: false });
  // Stop logic should still work even when the database is offline.
  const runtimeEnv = await loadResolvedSystemEnvironment(env);
  const services = getManagedServices(runtimeEnv).reverse();

  let stoppedAny = false;

  for (const service of services) {
    const stopped = await stopManagedService(service.id);
    console.log(`${stopped ? "Stopped" : "Not running"} ${service.name}.`);
    stoppedAny ||= stopped;
  }

  if (!stoppedAny) {
    console.log("No managed development processes were running.");
  }
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
