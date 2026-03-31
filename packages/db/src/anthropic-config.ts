import { readConfiguredRuntimeValue } from "./runtime-settings";
import type { ModelProfileRecord } from "./model-profiles";

type RuntimeEnv = Record<string, string | undefined>;

export function getConfiguredAnthropicApiKey(env: RuntimeEnv = process.env) {
  return readConfiguredRuntimeValue(env.ANTHROPIC_API_KEY);
}

export function getConfiguredAnthropicBaseUrl(env: RuntimeEnv = process.env) {
  return readConfiguredRuntimeValue(env.ANTHROPIC_BASE_URL);
}

export function buildAnthropicClientConfig(env: RuntimeEnv = process.env) {
  const apiKey = getConfiguredAnthropicApiKey(env);
  const baseURL = getConfiguredAnthropicBaseUrl(env);

  return {
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  };
}

export function buildAnthropicClientConfigFromModelProfile(
  profile: Pick<ModelProfileRecord, "apiKey" | "baseUrl">,
) {
  return {
    apiKey: profile.apiKey.trim(),
    baseURL: profile.baseUrl.trim(),
  };
}

export function buildClaudeAgentEnv(env: RuntimeEnv = process.env): RuntimeEnv {
  return {
    ...env,
    ANTHROPIC_API_KEY: getConfiguredAnthropicApiKey(env),
    ANTHROPIC_BASE_URL: getConfiguredAnthropicBaseUrl(env),
  };
}

export function buildClaudeAgentEnvFromModelProfile(
  profile: Pick<ModelProfileRecord, "apiKey" | "baseUrl" | "modelName">,
  env: RuntimeEnv = process.env,
): RuntimeEnv {
  return {
    ...env,
    ANTHROPIC_API_KEY: profile.apiKey.trim(),
    ANTHROPIC_BASE_URL: profile.baseUrl.trim(),
    ANTHROPIC_MODEL: profile.modelName.trim(),
  };
}
