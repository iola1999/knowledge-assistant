import fs from "node:fs/promises";
import path from "node:path";

import { query } from "@anthropic-ai/claude-agent-sdk";

import { createAssistantMcpServer } from "@knowledge-assistant/agent-tools";
import {
  ASSISTANT_MCP_SERVER_NAME,
  ASSISTANT_ALLOWED_TOOL_NAMES,
  ASSISTANT_TOOL,
  DEFAULT_SEARCH_WORKSPACE_KNOWLEDGE_TOP_K,
  DEFAULT_AGENT_MAX_TURNS,
  DEFAULT_GROUNDED_ANSWER_CONFIDENCE,
  normalizeAssistantToolName,
  type GroundedEvidence,
} from "@knowledge-assistant/contracts";

import {
  extractAssistantTextDelta,
  splitMockAssistantText,
} from "./assistant-stream";
import { renderGroundedAnswer } from "./final-answerer";

function getAgentWorkdirRoot() {
  return process.env.AGENT_WORKDIR_ROOT
    ? path.resolve(process.env.AGENT_WORKDIR_ROOT)
    : path.resolve(process.cwd(), ".agent-sessions");
}

export function getAllowedTools() {
  return [...ASSISTANT_ALLOWED_TOOL_NAMES];
}

function buildAgentSystemPrompt(input: { workspaceId: string; conversationId: string }) {
  return [
    "You are a grounded workspace assistant operating inside a single workspace.",
    `Current workspace_id: ${input.workspaceId}.`,
    `Current conversation_id: ${input.conversationId}.`,
    "When you use search_conversation_attachments, always pass the exact conversation_id shown above.",
    "When you use search_workspace_knowledge or create_report_outline, always pass the exact workspace_id shown above.",
    "Do not invent facts, sources, anchor IDs, or directory paths.",
    "If the workspace knowledge base does not support the answer, say so plainly.",
    "If the user mentions files uploaded in this chat or temporary attachments, search conversation attachments before the workspace knowledge base.",
    "Prefer workspace knowledge first. Use web tools when local evidence is insufficient.",
    "Use search_statutes only when the user explicitly asks for laws, regulations, or statute-level references.",
    "When citing workspace evidence in the final answer, mention the document path and page number when available.",
  ].join("\n");
}

function parseToolPayload(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const content = (value as { content?: Array<{ type?: string; text?: string }> }).content;
  const text = content?.find((item) => item.type === "text")?.text;
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function collectWorkspaceEvidence(
  toolName: string,
  payload: Record<string, unknown>,
  citationMap: Map<string, GroundedEvidence>,
) {
  const normalizedToolName = normalizeAssistantToolName(toolName);

  if (
    normalizedToolName === ASSISTANT_TOOL.SEARCH_WORKSPACE_KNOWLEDGE ||
    normalizedToolName === ASSISTANT_TOOL.SEARCH_CONVERSATION_ATTACHMENTS
  ) {
    const results = Array.isArray(payload.results) ? payload.results : [];
    for (const result of results) {
      if (!result || typeof result !== "object") {
        continue;
      }

      const anchorId = String((result as Record<string, unknown>).anchor_id ?? "").trim();
      if (!anchorId) {
        continue;
      }

      const documentPath = String(
        (result as Record<string, unknown>).document_path ?? "",
      ).trim();
      const pageNoRaw = (result as Record<string, unknown>).page_no;
      const pageNo =
        typeof pageNoRaw === "number" && Number.isFinite(pageNoRaw) ? pageNoRaw : null;
      const sectionLabel = String(
        (result as Record<string, unknown>).section_label ?? "",
      ).trim();
      const anchorLabel = String(
        (result as Record<string, unknown>).anchor_label ?? "",
      ).trim();
      const snippet = String((result as Record<string, unknown>).snippet ?? "").trim();

      citationMap.set(anchorId, {
        anchor_id: anchorId,
        document_path: documentPath,
        page_no: pageNo,
        label:
          anchorLabel ||
          [documentPath, pageNo ? `第${pageNo}页` : null, sectionLabel || null]
            .filter(Boolean)
            .join(" · ") ||
          anchorId,
        quote_text: snippet,
      });
    }
  }

  if (normalizedToolName === ASSISTANT_TOOL.READ_CITATION_ANCHOR) {
    const anchor =
      payload.anchor && typeof payload.anchor === "object"
        ? (payload.anchor as Record<string, unknown>)
        : null;

    if (anchor) {
      const anchorId = String(anchor.anchor_id ?? "").trim();
      if (anchorId) {
        const documentPath = String(anchor.document_path ?? "").trim();
        const pageNo = typeof anchor.page_no === "number" ? anchor.page_no : null;
        const anchorLabel = String(anchor.anchor_label ?? "").trim();
        const text = String(anchor.text ?? "").trim();

        citationMap.set(anchorId, {
          anchor_id: anchorId,
          document_path: documentPath,
          page_no: pageNo,
          label:
            anchorLabel ||
            [documentPath, pageNo ? `第${pageNo}页` : null].filter(Boolean).join(" · ") ||
            anchorId,
          quote_text: text,
        });
      }
    }
  }
}

export type RunAgentResponseInput = {
  prompt: string;
  workspaceId: string;
  conversationId: string;
  agentSessionId?: string | null;
  agentWorkdir?: string | null;
};

export type RunAgentResponseHooks = {
  onToolStarted?: (input: {
    toolName: string;
    toolInput: unknown;
    toolUseId: string;
  }) => Promise<void> | void;
  onToolFinished?: (input: {
    toolName: string;
    toolInput: unknown;
    toolResponse: unknown;
    toolUseId: string;
  }) => Promise<void> | void;
  onToolFailed?: (input: {
    toolName: string;
    toolInput: unknown;
    toolUseId: string;
    error: string;
  }) => Promise<void> | void;
  onAssistantDelta?: (input: {
    textDelta: string;
    fullText: string;
  }) => Promise<void> | void;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runAgentResponse(
  input: RunAgentResponseInput,
  hooks: RunAgentResponseHooks = {},
) {
  const prompt = input.prompt.trim();
  const workspaceId = input.workspaceId.trim();
  const conversationId = input.conversationId.trim();
  const requestedWorkdir = input.agentWorkdir?.trim() || undefined;
  const workdir =
    requestedWorkdir || path.join(getAgentWorkdirRoot(), conversationId.replace(/[^a-zA-Z0-9-_]/g, "_"));

  await fs.mkdir(workdir, { recursive: true });

  if (!process.env.ANTHROPIC_API_KEY) {
    const mockToolName = ASSISTANT_TOOL.SEARCH_WORKSPACE_KNOWLEDGE;
    const mockToolInput = {
      query: prompt,
      workspace_id: workspaceId,
      top_k: DEFAULT_SEARCH_WORKSPACE_KNOWLEDGE_TOP_K,
    };
    const mockToolUseId = `mock-${conversationId}`;
    const mockAnswer = [
      "当前正在使用本地 mock 会话链路。",
      "正式工具还可以后接，但消息入队、工具时间线、回答增量和最终完成事件已经会按真实链路工作。",
      "下一步可以继续把检索和 grounded answer 的真实能力逐步替换进去。",
    ].join("");

    await hooks.onToolStarted?.({
      toolName: mockToolName,
      toolInput: mockToolInput,
      toolUseId: mockToolUseId,
    });
    await sleep(120);
    await hooks.onToolFinished?.({
      toolName: mockToolName,
      toolInput: mockToolInput,
      toolResponse: {
        ok: true,
        results: [],
        mock: true,
      },
      toolUseId: mockToolUseId,
    });

    let streamedText = "";
    for (const chunk of splitMockAssistantText(mockAnswer, 1)) {
      streamedText += chunk;
      await hooks.onAssistantDelta?.({
        textDelta: chunk,
        fullText: streamedText,
      });
      await sleep(180);
    }

    return {
      ok: true as const,
      text: mockAnswer,
      sessionId: input.agentSessionId ?? null,
      workdir,
      citations: [],
      structured: {
        confidence: DEFAULT_GROUNDED_ANSWER_CONFIDENCE,
        unsupported_reason:
          "当前是本地 mock 会话链路，尚未接入真实 Anthropic Agent 调用。",
        missing_information: [],
      },
    };
  }

  const assistantServer = createAssistantMcpServer();
  let finalResult = "";
  let streamedDraft = "";
  let sessionId = input.agentSessionId ?? null;
  const citationMap = new Map<string, GroundedEvidence>();

  for await (const message of query({
    prompt,
    options: {
      tools: [],
      mcpServers: {
        [ASSISTANT_MCP_SERVER_NAME]: assistantServer,
      },
      allowedTools: getAllowedTools(),
      cwd: workdir,
      resume: input.agentSessionId ?? undefined,
      maxTurns: DEFAULT_AGENT_MAX_TURNS,
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: buildAgentSystemPrompt({ workspaceId, conversationId }),
      },
      hooks: {
        PreToolUse: [
          {
            hooks: [
              async (hookInput) => {
                await hooks.onToolStarted?.({
                  toolName: String((hookInput as { tool_name?: string }).tool_name ?? ""),
                  toolInput: (hookInput as { tool_input?: unknown }).tool_input,
                  toolUseId: String((hookInput as { tool_use_id?: string }).tool_use_id ?? ""),
                });

                return { continue: true };
              },
            ],
          },
        ],
        PostToolUse: [
          {
            hooks: [
              async (hookInput) => {
                const toolCall = hookInput as {
                  tool_name: string;
                  tool_input: unknown;
                  tool_response: unknown;
                  tool_use_id: string;
                };
                const payload = parseToolPayload(toolCall.tool_response);

                if (payload) {
                  collectWorkspaceEvidence(toolCall.tool_name, payload, citationMap);
                }

                await hooks.onToolFinished?.({
                  toolName: toolCall.tool_name,
                  toolInput: toolCall.tool_input,
                  toolResponse: toolCall.tool_response,
                  toolUseId: toolCall.tool_use_id,
                });

                return { continue: true };
              },
            ],
          },
        ],
        PostToolUseFailure: [
          {
            hooks: [
              async (hookInput) => {
                const failedTool = hookInput as {
                  tool_name: string;
                  tool_input: unknown;
                  tool_use_id: string;
                  error: string;
                };

                await hooks.onToolFailed?.({
                  toolName: failedTool.tool_name,
                  toolInput: failedTool.tool_input,
                  toolUseId: failedTool.tool_use_id,
                  error: failedTool.error,
                });

                return { continue: true };
              },
            ],
          },
        ],
      },
    },
  })) {
    if ("session_id" in message && typeof message.session_id === "string") {
      sessionId = message.session_id;
    }

    const textDelta = extractAssistantTextDelta(message);
    if (textDelta) {
      streamedDraft += textDelta;
      await hooks.onAssistantDelta?.({
        textDelta,
        fullText: streamedDraft,
      });
    }

    if (message.type === "result" && message.subtype === "success") {
      finalResult = message.result || streamedDraft;
    }
  }

  const groundedAnswer = await renderGroundedAnswer({
    prompt,
    draftText:
      finalResult || streamedDraft || "Agent completed without a final result payload.",
    evidence: Array.from(citationMap.values()),
  });

  return {
    ok: true as const,
    text: groundedAnswer.answer_markdown,
    sessionId,
    workdir,
    citations: groundedAnswer.citations,
    structured: {
      confidence: groundedAnswer.confidence,
      unsupported_reason: groundedAnswer.unsupported_reason,
      missing_information: groundedAnswer.missing_information,
    },
  };
}
