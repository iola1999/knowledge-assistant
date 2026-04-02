import { type ConversationMessageQuote } from "@/lib/api/conversation-message-quote";

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
  quote?: ConversationMessageQuote | null;
  workspacePrompt?: unknown;
}) {
  const content = String(input.content ?? "").trim();
  const workspacePrompt = normalizeWorkspacePrompt(input.workspacePrompt);
  const quotedText = input.quote?.text?.trim() ? input.quote.text.trim() : null;

  if (!workspacePrompt && !quotedText) {
    return content;
  }

  const sections: string[] = [];

  if (workspacePrompt) {
    sections.push(
      "以下是当前工作空间对所有回答的统一要求；如果本轮用户提出了更具体的新要求，以本轮要求为准：",
      workspacePrompt,
    );
  }

  if (quotedText) {
    sections.push(
      "当前用户引用了你上一条回答中的一段内容，希望你围绕这段内容继续解释或补充。下面的引用只用于说明追问焦点，不应被当作新的事实依据：",
      `引用内容：\n「${quotedText}」`,
    );
  }

  sections.push(`当前用户问题：\n${content}`);

  return sections.join("\n\n");
}
