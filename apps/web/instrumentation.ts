export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initRuntimeSettings } = await import("@knowledge-assistant/db");
    await initRuntimeSettings();
  }
}
