import fs from "node:fs/promises";
import path from "node:path";

import { query } from "@anthropic-ai/claude-agent-sdk";

import { createAssistantMcpServer } from "@anchordesk/agent-tools";
import {
  ASSISTANT_MCP_SERVER_NAME,
  ASSISTANT_ALLOWED_TOOL_NAMES,
  ASSISTANT_TOOL,
  DEFAULT_AGENT_MAX_TURNS,
  extractRawInlineCitationSlots,
  KNOWLEDGE_SOURCE_SCOPE,
  GROUNDED_EVIDENCE_KIND,
  normalizeAssistantToolName,
  type AssistantStreamPhase,
} from "@anchordesk/contracts";
import {
  type WorkspaceSearchableKnowledgeSummary,
  buildClaudeAgentEnvFromModelProfile,
  type ModelProfileRecord,
} from "@anchordesk/db";
import {
  extractAssistantRuntimeSignal,
  extractAssistantTextDelta,
} from "./assistant-stream";
import { type CollectedGroundedEvidence } from "./assistant-answer";
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

function buildLocalKnowledgePriorityLines(
  summary?: WorkspaceSearchableKnowledgeSummary | null,
) {
  if (!summary?.hasReadySearchableKnowledge) {
    return [];
  }

  const availabilityParts: string[] = [];

  if (summary.readyPrivateDocumentCount > 0) {
    availabilityParts.push(`${summary.readyPrivateDocumentCount} ready private document(s)`);
  }

  if (summary.readyGlobalDocumentCount > 0) {
    availabilityParts.push(
      `${summary.readyGlobalDocumentCount} ready document(s) from ${summary.searchableGlobalLibraryCount} searchable subscribed global librar${summary.searchableGlobalLibraryCount === 1 ? "y" : "ies"}`,
    );
  }

  const availabilityText =
    availabilityParts.join("; ") ||
    `${summary.totalReadyDocumentCount} ready local document(s)`;

  return [
    `This workspace currently has indexed local knowledge available (${availabilityText}).`,
    "When a question may depend on workspace documents, internal procedures, specs, policies, reports, notes, or other local materials, try search_workspace_knowledge early before relying on web search.",
    "Still consider the other tools when local evidence is insufficient, the user explicitly asks for web or statute research, or the task needs non-local data.",
  ];
}

export function buildAgentSystemPrompt(input: {
  workspaceId: string;
  conversationId: string;
  searchableKnowledge?: WorkspaceSearchableKnowledgeSummary | null;
}) {
  return [
    "You are a grounded workspace assistant operating inside a single workspace.",
    `Current workspace_id: ${input.workspaceId}.`,
    `Current conversation_id: ${input.conversationId}.`,
    "When you use search_conversation_attachments, always pass the exact conversation_id shown above.",
    "When you use search_workspace_knowledge or create_report_outline, always pass the exact workspace_id shown above.",
    "Do not invent facts, sources, anchor IDs, or directory paths.",
    "If the workspace knowledge base does not support the answer, say so plainly.",
    "If the user mentions files uploaded in this chat or temporary attachments, search conversation attachments before the workspace knowledge base.",
    "Prefer conversation attachments and workspace knowledge before web tools whenever local materials may be relevant. Use web tools when local evidence is insufficient.",
    ...buildLocalKnowledgePriorityLines(input.searchableKnowledge),
    "When using web information in the final answer, fetch the source URL first and cite the fetched page instead of raw search snippets.",
    "When you need to fetch multiple independent web URLs, prefer fetch_sources instead of repeating fetch_source serially.",
    "Use search_statutes only when the user explicitly asks for laws, regulations, or statute-level references.",
    "When citing workspace evidence in the final answer, mention the document path and page number when available.",
    "Tool results may include citation_token fields such as [[cite:3]].",
    "When a paragraph, bullet, or sentence makes a factual claim supported by tool output, append one or more exact citation_token values immediately after that claim.",
    "Use only citation_token values returned by tools in this turn. Never invent or rewrite citation tokens.",
    "If you cannot support a claim with the available tool evidence, say so plainly instead of adding a citation token.",
  ].join("\n");
}

export function parseToolPayload(value: unknown) {
  const content = Array.isArray(value)
    ? (value as Array<{ type?: string; text?: string }>)
    : value && typeof value === "object"
      ? (value as { content?: Array<{ type?: string; text?: string }> }).content
      : null;
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

function buildDocumentEvidenceId(anchorId: string) {
  return `anchor:${anchorId}`;
}

function buildWebEvidenceId(url: string) {
  return `web:${url}`;
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function buildWebEvidenceQuote(paragraphs: string[]) {
  return truncateText(
    paragraphs
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join("\n"),
    360,
  );
}

function collectFetchedWebEvidence(input: {
  source: Record<string, unknown>;
  citationMap: Map<string, CollectedGroundedEvidence>;
  webSearchResultsByUrl: Map<
    string,
    {
      title: string;
      domain: string;
      snippet: string;
    }
  >;
}) {
  const url = String(input.source.url ?? "").trim();
  const citationId = Number(input.source.citation_id);
  if (!url) {
    return;
  }

  const title = String(input.source.title ?? "").trim();
  const paragraphs = Array.isArray(input.source.paragraphs)
    ? input.source.paragraphs
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const searchResult = input.webSearchResultsByUrl.get(url);
  const domain = (() => {
    if (searchResult?.domain) {
      return searchResult.domain;
    }

    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  const label = [title || searchResult?.title || url, domain || null]
    .filter(Boolean)
    .join(" · ");
  const quoteText = buildWebEvidenceQuote(paragraphs) || searchResult?.snippet || label;

  if (!label || !quoteText || !domain) {
    return;
  }

  if (!Number.isInteger(citationId) || citationId <= 0) {
    return;
  }

  input.citationMap.set(buildWebEvidenceId(url), {
    citationId,
    evidence: {
      evidence_id: buildWebEvidenceId(url),
      kind: GROUNDED_EVIDENCE_KIND.WEB_PAGE,
      url,
      domain,
      title: title || searchResult?.title || domain,
      label,
      quote_text: quoteText,
      source_scope: KNOWLEDGE_SOURCE_SCOPE.WEB,
      library_title: null,
    },
  });
}

function collectGroundedEvidence(
  toolName: string,
  payload: Record<string, unknown>,
  citationMap: Map<string, CollectedGroundedEvidence>,
  webSearchResultsByUrl: Map<
    string,
    {
      title: string;
      domain: string;
      snippet: string;
    }
  >,
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
      const sourceScope =
        typeof (result as Record<string, unknown>).source_scope === "string"
          ? String((result as Record<string, unknown>).source_scope)
          : null;
      const citationId = Number((result as Record<string, unknown>).citation_id);
      const libraryTitle = String(
        (result as Record<string, unknown>).library_title ?? "",
      ).trim();

      if (!Number.isInteger(citationId) || citationId <= 0) {
        continue;
      }

      citationMap.set(buildDocumentEvidenceId(anchorId), {
        citationId,
        evidence: {
          evidence_id: buildDocumentEvidenceId(anchorId),
          kind: GROUNDED_EVIDENCE_KIND.DOCUMENT_ANCHOR,
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
          source_scope:
            sourceScope === KNOWLEDGE_SOURCE_SCOPE.WORKSPACE_PRIVATE ||
            sourceScope === KNOWLEDGE_SOURCE_SCOPE.GLOBAL_LIBRARY
              ? sourceScope
              : null,
          library_title: libraryTitle || null,
        },
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
        const citationId = Number(anchor.citation_id);
        if (!Number.isInteger(citationId) || citationId <= 0) {
          return;
        }

        citationMap.set(buildDocumentEvidenceId(anchorId), {
          citationId,
          evidence: {
            evidence_id: buildDocumentEvidenceId(anchorId),
            kind: GROUNDED_EVIDENCE_KIND.DOCUMENT_ANCHOR,
            anchor_id: anchorId,
            document_path: documentPath,
            page_no: pageNo,
            label:
              anchorLabel ||
              [documentPath, pageNo ? `第${pageNo}页` : null].filter(Boolean).join(" · ") ||
              anchorId,
            quote_text: text,
            source_scope: null,
            library_title: null,
          },
        });
      }
    }
  }

  if (normalizedToolName === ASSISTANT_TOOL.SEARCH_WEB_GENERAL) {
    const results = Array.isArray(payload.results) ? payload.results : [];
    for (const result of results) {
      if (!result || typeof result !== "object") {
        continue;
      }

      const url = String((result as Record<string, unknown>).url ?? "").trim();
      if (!url) {
        continue;
      }

      webSearchResultsByUrl.set(url, {
        title: String((result as Record<string, unknown>).title ?? "").trim(),
        domain: String((result as Record<string, unknown>).domain ?? "").trim(),
        snippet: String((result as Record<string, unknown>).snippet ?? "").trim(),
      });
    }
  }

  if (normalizedToolName === ASSISTANT_TOOL.FETCH_SOURCE) {
    const source =
      payload.source && typeof payload.source === "object"
        ? (payload.source as Record<string, unknown>)
        : null;
    if (!source) {
      return;
    }

    collectFetchedWebEvidence({
      source,
      citationMap,
      webSearchResultsByUrl,
    });
  }

  if (normalizedToolName === ASSISTANT_TOOL.FETCH_SOURCES) {
    const sources = Array.isArray(payload.sources)
      ? payload.sources.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === "object",
        )
      : [];

    for (const source of sources) {
      collectFetchedWebEvidence({
        source,
        citationMap,
        webSearchResultsByUrl,
      });
    }
  }
}

export type RunAgentResponseInput = {
  prompt: string;
  workspaceId: string;
  conversationId: string;
  modelProfile: ModelProfileRecord;
  agentSessionId?: string | null;
  agentWorkdir?: string | null;
  searchableKnowledge?: WorkspaceSearchableKnowledgeSummary | null;
};

export type RunAgentResponseHooks = {
  onAssistantStatus?: (input: {
    phase: AssistantStreamPhase;
    statusText: string;
    toolName?: string | null;
    toolUseId?: string | null;
    taskId?: string | null;
  }) => Promise<void> | void;
  onToolStarted?: (input: {
    toolName: string;
    toolInput: unknown;
    toolUseId: string;
  }) => Promise<void> | void;
  onToolProgress?: (input: {
    toolName: string;
    toolUseId: string;
    elapsedSeconds: number;
    statusText: string;
    taskId?: string | null;
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
    modelName: input.modelProfile.modelName,
    modelProfileId: input.modelProfile.id,
    workspaceId,
    workdir,
  });

  await fs.mkdir(workdir, { recursive: true });

  const agentEnv = buildClaudeAgentEnvFromModelProfile(input.modelProfile);
  const runtimeLogContext = buildClaudeAgentRuntimeLogContext(agentEnv);

  if (!agentEnv.ANTHROPIC_API_KEY) {
    requestLogger.error(
      {
        conversationId,
        modelName: input.modelProfile.modelName,
        modelProfileId: input.modelProfile.id,
        workspaceId,
        workdir,
        ...runtimeLogContext,
      },
      "anthropic api key missing for Claude Agent SDK query",
    );
    throw new Error("Anthropic API key is not configured.");
  }

  const assistantServer = createAssistantMcpServer({
    modelProfile: input.modelProfile,
  });
  let finalResult = "";
  let streamedAnswer = "";
  let sessionId = input.agentSessionId ?? null;
  const citationMap = new Map<string, CollectedGroundedEvidence>();
  const webSearchResultsByUrl = new Map<
    string,
    {
      title: string;
      domain: string;
      snippet: string;
    }
  >();

  requestLogger.info(
    {
      conversationId,
      modelName: input.modelProfile.modelName,
      modelProfileId: input.modelProfile.id,
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
        includePartialMessages: true,
        mcpServers: {
          [ASSISTANT_MCP_SERVER_NAME]: assistantServer,
        },
        allowedTools: getAllowedTools(),
        cwd: workdir,
        env: agentEnv,
        model: input.modelProfile.modelName,
        debug: isClaudeAgentSdkDebugEnabled(agentEnv),
        stderr: (data) => {
          for (const line of splitClaudeAgentStderr(data)) {
            requestLogger.debug(
              {
                conversationId,
                modelName: input.modelProfile.modelName,
                modelProfileId: input.modelProfile.id,
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
          append: buildAgentSystemPrompt({
            workspaceId,
            conversationId,
            searchableKnowledge: input.searchableKnowledge ?? null,
          }),
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
                    collectGroundedEvidence(
                      toolCall.tool_name,
                      payload,
                      citationMap,
                      webSearchResultsByUrl,
                    );
                  } else {
                    requestLogger.debug(
                      {
                        toolName: toolCall.tool_name,
                        toolUseId: toolCall.tool_use_id,
                        toolResponseType: Array.isArray(toolCall.tool_response)
                          ? "array"
                          : toolCall.tool_response === null
                            ? "null"
                            : typeof toolCall.tool_response,
                      },
                      "tool completed without a parseable payload",
                    );
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

      const runtimeSignal = extractAssistantRuntimeSignal(message);
      if (runtimeSignal?.kind === "assistant_status") {
        await hooks.onAssistantStatus?.({
          phase: runtimeSignal.phase,
          statusText: runtimeSignal.statusText,
          toolName: runtimeSignal.toolName ?? null,
          toolUseId: runtimeSignal.toolUseId ?? null,
          taskId: runtimeSignal.taskId ?? null,
        });
      }

      if (runtimeSignal?.kind === "tool_progress") {
        await hooks.onToolProgress?.({
          toolName: runtimeSignal.toolName,
          toolUseId: runtimeSignal.toolUseId,
          elapsedSeconds: runtimeSignal.elapsedSeconds,
          statusText: runtimeSignal.statusText,
          taskId: runtimeSignal.taskId ?? null,
        });
      }

      const textDelta = extractAssistantTextDelta(message);
      if (textDelta) {
        streamedAnswer += textDelta;
        await hooks.onAssistantStatus?.({
          phase: "drafting",
          statusText: "助手正在生成回答...",
        });
        await hooks.onAssistantDelta?.({
          textDelta,
          fullText: streamedAnswer,
        });
      }

      if (
        message.type === CLAUDE_AGENT_MESSAGE_TYPE.RESULT &&
        message.subtype === CLAUDE_AGENT_RESULT_SUBTYPE.SUCCESS
      ) {
        finalResult = message.result || streamedAnswer;
      }
    }

    requestLogger.info(
      {
        sessionId,
        modelName: input.modelProfile.modelName,
        modelProfileId: input.modelProfile.id,
        finalResultLength: finalResult.length,
        streamedAnswerLength: streamedAnswer.length,
        workspaceEvidenceCount: citationMap.size,
        documentEvidenceCount: Array.from(citationMap.values()).filter(
          (item) => item.evidence.kind === GROUNDED_EVIDENCE_KIND.DOCUMENT_ANCHOR,
        ).length,
        webEvidenceCount: Array.from(citationMap.values()).filter(
          (item) => item.evidence.kind === GROUNDED_EVIDENCE_KIND.WEB_PAGE,
        ).length,
      },
      "Claude Agent SDK query completed",
    );
  } catch (error) {
    requestLogger.error(
      {
        conversationId,
        modelName: input.modelProfile.modelName,
        modelProfileId: input.modelProfile.id,
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

  const rawAnswerText =
    finalResult || streamedAnswer || "Agent completed without a final result payload.";
  const inlineCitationMarkerCount = extractRawInlineCitationSlots(rawAnswerText).length;

  requestLogger.info(
    {
      sessionId,
      modelName: input.modelProfile.modelName,
      modelProfileId: input.modelProfile.id,
      citationCount: citationMap.size,
      inlineCitationMarkerCount,
      hasInlineCitationMarkers: inlineCitationMarkerCount > 0,
      answerLength: rawAnswerText.length,
    },
    "assistant answer collected before citation materialization",
  );

  return {
    ok: true as const,
    text: rawAnswerText,
    sessionId,
    workdir,
    citations: Array.from(citationMap.values()),
  };
}
