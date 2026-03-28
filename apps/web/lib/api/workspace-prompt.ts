export const WORKSPACE_PROMPT_MAX_LENGTH = 500;

export function normalizeWorkspacePrompt(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

export function summarizeWorkspacePrompt(
  value: unknown,
  maxLength = 84,
) {
  const normalized = normalizeWorkspacePrompt(value)?.replace(/\s+/g, " ") ?? null;
  if (!normalized) {
    return null;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function buildConversationPrompt(input: {
  content: string;
  workspacePrompt?: unknown;
}) {
  const content = String(input.content ?? "").trim();
  const workspacePrompt = normalizeWorkspacePrompt(input.workspacePrompt);

  if (!workspacePrompt) {
    return content;
  }

  return [
    "以下是当前工作空间对所有回答的统一要求；如果本轮用户提出了更具体的新要求，以本轮要求为准：",
    workspacePrompt,
    "",
    "当前用户问题：",
    content,
  ].join("\n");
}
