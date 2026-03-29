import fs from "node:fs/promises";
import path from "node:path";

import { query } from "@anthropic-ai/claude-agent-sdk";

import { createAssistantMcpServer } from "@anchordesk/agent-tools";
import {
  ASSISTANT_MCP_SERVER_NAME,
  ASSISTANT_ALLOWED_TOOL_NAMES,
  ASSISTANT_TOOL,
  DEFAULT_AGENT_MAX_TURNS,
  normalizeAssistantToolName,
  type GroundedEvidence,
} from "@anchordesk/contracts";
import {
  buildClaudeAgentEnv,
  getConfiguredAnthropicApiKey,
} from "@anchordesk/db";
import { extractAssistantTextDelta } from "./assistant-stream";
import { renderGroundedAnswer } from "./final-answerer";
import {
  buildClaudeAgentRuntimeLogContext,
  isClaudeAgentSdkDebugEnabled,
  serializeErrorForLog,
  splitClaudeAgentStderr,
} from "./runtime-log";
import { logger } from "./logger";

const CLAUDE_AGENT_MESSAGE_TYPE = {
  RESULT: "result",
} as const;

const CLAUDE_AGENT_RESULT_SUBTYPE = {
  SUCCESS: "success",
} as const;

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
  const requestLogger = logger.child({
    conversationId,
    workspaceId,
    workdir,
  });

  await fs.mkdir(workdir, { recursive: true });

  if (!getConfiguredAnthropicApiKey()) {
    requestLogger.error(
      {
        conversationId,
        workspaceId,
        workdir,
        ...buildClaudeAgentRuntimeLogContext(),
      },
      "anthropic api key missing for Claude Agent SDK query",
    );
    throw new Error("Anthropic API key is not configured.");
  }

  const assistantServer = createAssistantMcpServer();
  const agentEnv = buildClaudeAgentEnv();
  const runtimeLogContext = buildClaudeAgentRuntimeLogContext(agentEnv);
  let finalResult = "";
  let streamedDraft = "";
  let sessionId = input.agentSessionId ?? null;
  const citationMap = new Map<string, GroundedEvidence>();

  requestLogger.info(
    {
      conversationId,
      workspaceId,
      workdir,
      requestedSessionId: input.agentSessionId ?? null,
      ...runtimeLogContext,
    },
    "starting Claude Agent SDK query",
  );

  try {
    for await (const message of query({
      prompt,
      options: {
        tools: [],
        mcpServers: {
          [ASSISTANT_MCP_SERVER_NAME]: assistantServer,
        },
        allowedTools: getAllowedTools(),
        cwd: workdir,
        env: agentEnv,
        debug: isClaudeAgentSdkDebugEnabled(agentEnv),
        stderr: (data) => {
          for (const line of splitClaudeAgentStderr(data)) {
            requestLogger.debug(
              {
                conversationId,
                workspaceId,
                workdir,
                line,
              },
              "Claude Agent SDK stderr",
            );
          }
        },
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
                    toolUseId: String(
                      (hookInput as { tool_use_id?: string }).tool_use_id ?? "",
                    ),
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

      if (
        message.type === CLAUDE_AGENT_MESSAGE_TYPE.RESULT &&
        message.subtype === CLAUDE_AGENT_RESULT_SUBTYPE.SUCCESS
      ) {
        finalResult = message.result || streamedDraft;
      }
    }

    requestLogger.info(
      {
        sessionId,
        finalResultLength: finalResult.length,
        streamedDraftLength: streamedDraft.length,
        workspaceEvidenceCount: citationMap.size,
      },
      "Claude Agent SDK query completed",
    );
  } catch (error) {
    requestLogger.error(
      {
        conversationId,
        workspaceId,
        workdir,
        sessionId,
        ...runtimeLogContext,
        error: serializeErrorForLog(error),
      },
      "Claude Agent SDK query failed",
    );
    throw error;
  }

  try {
    const groundedAnswer = await renderGroundedAnswer({
      prompt,
      draftText:
        finalResult || streamedDraft || "Agent completed without a final result payload.",
      evidence: Array.from(citationMap.values()),
    });

    requestLogger.info(
      {
        sessionId,
        citationCount: groundedAnswer.citations.length,
        answerLength: groundedAnswer.answer_markdown.length,
      },
      "grounded answer rendered",
    );

    return {
      ok: true as const,
      text: groundedAnswer.answer_markdown,
      sessionId,
      workdir,
      citations: groundedAnswer.citations,
    };
  } catch (error) {
    requestLogger.error(
      {
        sessionId,
        workspaceEvidenceCount: citationMap.size,
        error: serializeErrorForLog(error),
      },
      "grounded answer render failed",
    );
    throw error;
  }
}
