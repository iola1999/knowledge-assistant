export { serializeErrorForLog } from "@anchordesk/logging";

type RuntimeEnv = Record<string, string | undefined>;
type ClaudeAgentSdkHookRegistrations =
  | Record<string, Array<{ hooks?: unknown[] }> | undefined>
  | null
  | undefined;

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

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function buildHookCountSummary(hooks: ClaudeAgentSdkHookRegistrations) {
  if (!hooks) {
    return {};
  }

  const summary: Record<string, number> = {};

  for (const [name, registrations] of Object.entries(hooks)) {
    const hookCount = Array.isArray(registrations)
      ? registrations.reduce((count, registration) => {
          const registeredHooks = Array.isArray(registration?.hooks)
            ? registration.hooks.length
            : 0;
          return count + registeredHooks;
        }, 0)
      : 0;

    if (hookCount > 0) {
      summary[name] = hookCount;
    }
  }

  return summary;
}

export function buildClaudeAgentSdkRequestLogPayload(input: {
  prompt: string;
  options: {
    tools?: unknown;
    includePartialMessages?: boolean;
    mcpServers?: Record<string, unknown> | null | undefined;
    allowedTools?: unknown;
    cwd?: string | undefined;
    env?: RuntimeEnv | undefined;
    model?: string | undefined;
    debug?: boolean | undefined;
    stderr?: unknown;
    resume?: string | undefined;
    maxTurns?: number | undefined;
    systemPrompt?:
      | {
          type?: string | undefined;
          preset?: string | undefined;
          append?: string | undefined;
        }
      | null
      | undefined;
    hooks?: ClaudeAgentSdkHookRegistrations;
  };
}) {
  const systemPromptAppend =
    typeof input.options.systemPrompt?.append === "string"
      ? input.options.systemPrompt.append
      : "";
  const mcpServerNames = Object.keys(input.options.mcpServers ?? {}).sort();

  return {
    prompt: input.prompt,
    promptLength: input.prompt.length,
    options: {
      tools: normalizeStringArray(input.options.tools),
      includePartialMessages: Boolean(input.options.includePartialMessages),
      mcpServers: {
        names: mcpServerNames,
        count: mcpServerNames.length,
      },
      allowedTools: normalizeStringArray(input.options.allowedTools),
      cwd: normalizeRuntimeValue(input.options.cwd) ?? null,
      env: buildClaudeAgentRuntimeLogContext(input.options.env ?? {}),
      model: normalizeRuntimeValue(input.options.model) ?? null,
      debug: Boolean(input.options.debug),
      hasStderrHandler: typeof input.options.stderr === "function",
      resume: normalizeRuntimeValue(input.options.resume) ?? null,
      maxTurns:
        typeof input.options.maxTurns === "number" &&
        Number.isFinite(input.options.maxTurns)
          ? input.options.maxTurns
          : null,
      systemPrompt: input.options.systemPrompt
        ? {
            type: normalizeRuntimeValue(input.options.systemPrompt.type) ?? null,
            preset: normalizeRuntimeValue(input.options.systemPrompt.preset) ?? null,
            append: systemPromptAppend,
            appendLength: systemPromptAppend.length,
          }
        : null,
      hooks: buildHookCountSummary(input.options.hooks),
    },
  };
}

export function splitClaudeAgentStderr(data: string) {
  return data
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}
