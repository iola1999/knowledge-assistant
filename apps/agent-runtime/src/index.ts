import express from "express";
import { query } from "@anthropic-ai/claude-agent-sdk";

import { createLegalMcpServer } from "@law-doc/agent-tools";

const app = express();
app.use(express.json());

const port = Number(process.env.PORT ?? 4001);

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

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/respond", async (req, res) => {
  const prompt = String(req.body?.prompt ?? "").trim();
  const mode = String(req.body?.mode ?? "kb_only");

  if (!prompt) {
    res.status(400).json({ ok: false, error: "prompt is required" });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.json({
      ok: true,
      text: "Agent runtime is configured, but ANTHROPIC_API_KEY is not set yet.",
      mode,
    });
    return;
  }

  try {
    const legalServer = createLegalMcpServer();
    let finalResult = "";

    for await (const message of query({
      prompt,
      options: {
        mcpServers: {
          legal: legalServer,
        },
        allowedTools: getAllowedTools(mode),
        maxTurns: 6,
      },
    })) {
      if ("result" in message && typeof message.result === "string") {
        finalResult = message.result;
      }
    }

    res.json({
      ok: true,
      text: finalResult || "Agent completed without a final result payload.",
      mode,
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
