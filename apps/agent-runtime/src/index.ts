import express from "express";
import { Worker } from "bullmq";

import { initRuntimeSettings } from "@knowledge-assistant/db";
import { QUEUE_NAMES, getRedisConnection } from "@knowledge-assistant/queue";

import { processConversationResponseJob } from "./process-conversation-job";
import { runAgentResponse } from "./run-agent-response";

async function main() {
  await initRuntimeSettings();

  const app = express();
  app.use(express.json());

  const port = Number(process.env.PORT ?? 4001);

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/respond", async (req, res) => {
    const prompt = String(req.body?.prompt ?? "").trim();
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

    try {
      const result = await runAgentResponse({
        prompt,
        workspaceId,
        conversationId,
        agentSessionId,
        agentWorkdir: requestedWorkdir,
      });

      res.json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown agent runtime error";
      res.status(500).json({ ok: false, error: message });
    }
  });

  const respondWorker = new Worker(
    QUEUE_NAMES.respond,
    async (job) => {
      await processConversationResponseJob(job.data);
    },
    {
      connection: getRedisConnection(),
    },
  );

  respondWorker.on("failed", (job, error) => {
    console.error(
      `[agent-runtime] conversation job failed ${job?.id ?? "unknown"}: ${error.message}`,
    );
  });

  app.listen(port, () => {
    console.log(`[agent-runtime] listening on ${port}`);
  });
}

main().catch((error) => {
  console.error("[agent-runtime] startup failed:", error);
  process.exit(1);
});
