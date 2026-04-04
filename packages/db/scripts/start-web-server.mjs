import { applyDatabaseRuntimeSettings } from "./runtime-settings-bootstrap.mjs";

await applyDatabaseRuntimeSettings();
await import("../../apps/web/server.js");
