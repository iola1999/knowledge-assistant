export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initRuntimeSettings } = await import("@anchordesk/db");
    await initRuntimeSettings();
  }
}
