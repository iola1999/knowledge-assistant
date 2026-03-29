const AGENT_RUNTIME_ERROR_PREFIX = "Agent runtime failed:";

function readErrorMessage(input: unknown) {
  if (typeof input === "string") {
    return input.trim();
  }

  if (
    input &&
    typeof input === "object" &&
    "message" in input &&
    typeof (input as { message?: unknown }).message === "string"
  ) {
    return String((input as { message: string }).message).trim();
  }

  return "";
}

function readNestedJsonError(message: string) {
  try {
    const parsed = JSON.parse(message) as { error?: unknown; message?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error.trim();
    }

    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message.trim();
    }
  } catch {
    return null;
  }

  return null;
}

function unwrapConversationFailureMessage(input: unknown) {
  let current = readErrorMessage(input);

  for (let index = 0; index < 3; index += 1) {
    if (!current) {
      return "";
    }

    if (current.startsWith(AGENT_RUNTIME_ERROR_PREFIX)) {
      current = current.slice(AGENT_RUNTIME_ERROR_PREFIX.length).trim();
      continue;
    }

    const nestedError = readNestedJsonError(current);
    if (nestedError && nestedError !== current) {
      current = nestedError;
      continue;
    }

    break;
  }

  return current.trim();
}

export function normalizeConversationFailureMessage(input: unknown) {
  const message = unwrapConversationFailureMessage(input);

  if (!message) {
    return "Agent 处理失败，原因未明确。";
  }

  if (message.includes("Custom Id cannot contain :")) {
    return "消息入队失败：队列任务 ID 不能包含冒号，回答还没有真正开始生成。";
  }

  if (
    message.includes("Anthropic API key is not configured") ||
    message.includes("ANTHROPIC_API_KEY") ||
    message.includes("No API key provided")
  ) {
    return "Anthropic LLM provider 未配置，请先在 /settings 配置 Anthropic API key。";
  }

  if (message.includes("Web search provider is not configured")) {
    return "联网搜索 provider 未配置；如果当前问题依赖联网检索，请先在 /settings 配置搜索 provider。";
  }

  if (message.includes("Agent runtime is not configured")) {
    return "Agent Runtime 未配置，消息已保存，但当前无法自动生成回答。";
  }

  return message;
}
