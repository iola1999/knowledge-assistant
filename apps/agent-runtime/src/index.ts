import fs from "node:fs/promises";
import path from "node:path";

import express from "express";
import { query } from "@anthropic-ai/claude-agent-sdk";

import { createLegalMcpServer } from "@law-doc/agent-tools";

const app = express();
app.use(express.json());

const port = Number(process.env.PORT ?? 4001);
const agentWorkdirRoot = process.env.AGENT_WORKDIR_ROOT
  ? path.resolve(process.env.AGENT_WORKDIR_ROOT)
  : path.resolve(process.cwd(), ".agent-sessions");

function getAllowedTools(mode: string) {
  if (mode === "kb_only") {
    return [
      "mcp__legal__search_workspace_knowledge",
      "mcp__legal__read_citation_anchor",
    ];
  }

  return [
    "mcp__legal__search_workspace_knowledge",
    "mcp__legal__read_citation_anchor",
    "mcp__legal__search_statutes",
    "mcp__legal__search_web_general",
    "mcp__legal__fetch_source",
    "mcp__legal__create_report_outline",
    "mcp__legal__write_report_section",
  ];
}

function buildAgentSystemPrompt(input: { workspaceId: string; mode: string }) {
  return [
    "You are a legal knowledge assistant operating inside a single workspace.",
    `Current workspace_id: ${input.workspaceId}.`,
    `Current mode: ${input.mode}.`,
    "When you use search_workspace_knowledge or create_report_outline, always pass the exact workspace_id shown above.",
    "Do not invent facts, sources, anchor IDs, or directory paths.",
    "If the workspace knowledge base does not support the answer, say so plainly.",
    "Prefer workspace knowledge first. Use web/statute tools only when mode allows it and local evidence is insufficient.",
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

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/respond", async (req, res) => {
  const prompt = String(req.body?.prompt ?? "").trim();
  const mode = String(req.body?.mode ?? "kb_only");
  const workspaceId = String(req.body?.workspaceId ?? "").trim();
  const conversationId = String(req.body?.conversationId ?? "").trim();
  const agentSessionId = String(req.body?.agentSessionId ?? "").trim() || undefined;
  const requestedWorkdir = String(req.body?.agentWorkdir ?? "").trim() || undefined;

  if (!prompt || !workspaceId || !conversationId) {
    res
      .status(400)
      .json({ ok: false, error: "prompt, workspaceId, and conversationId are required" });
    return;
  }

  const workdir =
    requestedWorkdir || path.join(agentWorkdirRoot, conversationId.replace(/[^a-zA-Z0-9-_]/g, "_"));

  await fs.mkdir(workdir, { recursive: true });

  if (!process.env.ANTHROPIC_API_KEY) {
    res.json({
      ok: true,
      text: "Agent runtime is configured, but ANTHROPIC_API_KEY is not set yet.",
      mode,
      sessionId: agentSessionId ?? null,
      workdir,
      citations: [],
    });
    return;
  }

  try {
    const legalServer = createLegalMcpServer();
    let finalResult = "";
    let sessionId = agentSessionId ?? null;
    const citationMap = new Map<
      string,
      {
        anchor_id: string;
        document_path: string;
        page_no: number | null;
        label: string;
        quote_text: string;
      }
    >();

    for await (const message of query({
      prompt,
      options: {
        tools: [],
        mcpServers: {
          legal: legalServer,
        },
        allowedTools: getAllowedTools(mode),
        cwd: workdir,
        resume: agentSessionId,
        maxTurns: 6,
        systemPrompt: {
          type: "preset",
          preset: "claude_code",
          append: buildAgentSystemPrompt({ workspaceId, mode }),
        },
        hooks: {
          PostToolUse: [
            {
              hooks: [
                async (input) => {
                  const toolCall = input as {
                    tool_name: string;
                    tool_response: unknown;
                  };
                  const toolName = toolCall.tool_name;
                  const payload = parseToolPayload(toolCall.tool_response);

                  if (
                    payload &&
                    (toolName.endsWith("search_workspace_knowledge") ||
                      toolName === "search_workspace_knowledge")
                  ) {
                    const results = Array.isArray(payload.results) ? payload.results : [];
                    for (const result of results) {
                      if (!result || typeof result !== "object") {
                        continue;
                      }

                      const anchorId = String(
                        (result as Record<string, unknown>).anchor_id ?? "",
                      ).trim();
                      if (!anchorId) {
                        continue;
                      }

                      const documentPath = String(
                        (result as Record<string, unknown>).document_path ?? "",
                      ).trim();
                      const pageNoRaw = (result as Record<string, unknown>).page_no;
                      const pageNo =
                        typeof pageNoRaw === "number" && Number.isFinite(pageNoRaw)
                          ? pageNoRaw
                          : null;
                      const sectionLabel = String(
                        (result as Record<string, unknown>).section_label ?? "",
                      ).trim();
                      const snippet = String(
                        (result as Record<string, unknown>).snippet ?? "",
                      ).trim();

                      citationMap.set(anchorId, {
                        anchor_id: anchorId,
                        document_path: documentPath,
                        page_no: pageNo,
                        label:
                          [documentPath, pageNo ? `第${pageNo}页` : null, sectionLabel || null]
                            .filter(Boolean)
                            .join(" · ") || anchorId,
                        quote_text: snippet,
                      });
                    }
                  }

                  if (
                    payload &&
                    (toolName.endsWith("read_citation_anchor") || toolName === "read_citation_anchor")
                  ) {
                    const anchor =
                      payload.anchor && typeof payload.anchor === "object"
                        ? (payload.anchor as Record<string, unknown>)
                        : null;

                    if (anchor) {
                      const anchorId = String(anchor.anchor_id ?? "").trim();
                      if (anchorId) {
                        const documentPath = String(anchor.document_path ?? "").trim();
                        const pageNo =
                          typeof anchor.page_no === "number" ? anchor.page_no : null;
                        const text = String(anchor.text ?? "").trim();

                        citationMap.set(anchorId, {
                          anchor_id: anchorId,
                          document_path: documentPath,
                          page_no: pageNo,
                          label:
                            [documentPath, pageNo ? `第${pageNo}页` : null]
                              .filter(Boolean)
                              .join(" · ") || anchorId,
                          quote_text: text,
                        });
                      }
                    }
                  }

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

      if (message.type === "result" && message.subtype === "success") {
        finalResult = message.result;
      }
    }

    res.json({
      ok: true,
      text: finalResult || "Agent completed without a final result payload.",
      mode,
      sessionId,
      workdir,
      citations: Array.from(citationMap.values()),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown agent runtime error";
    res.status(500).json({ ok: false, error: message });
  }
});

app.listen(port, () => {
  console.log(`[agent-runtime] listening on ${port}`);
});
