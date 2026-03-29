export { serializeErrorForLog } from "@anchordesk/logging";

type RuntimeEnv = Record<string, string | undefined>;

function normalizeRuntimeValue(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function isClaudeAgentSdkDebugEnabled(env: RuntimeEnv = process.env) {
  const raw = normalizeRuntimeValue(
    env.DEBUG_CLAUDE_AGENT_SDK ?? env.CLAUDE_AGENT_SDK_DEBUG,
  );
  if (!raw) {
    return false;
  }

  return ["1", "true", "yes", "on", "enabled"].includes(raw.toLowerCase());
}

export function buildClaudeAgentRuntimeLogContext(env: RuntimeEnv = process.env) {
  const apiKey = normalizeRuntimeValue(env.ANTHROPIC_API_KEY);
  const baseUrl = normalizeRuntimeValue(env.ANTHROPIC_BASE_URL);

  return {
    hasApiKey: Boolean(apiKey),
    baseUrl: baseUrl ?? null,
    sdkDebugEnabled: isClaudeAgentSdkDebugEnabled(env),
  };
}

export function splitClaudeAgentStderr(data: string) {
  return data
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}
