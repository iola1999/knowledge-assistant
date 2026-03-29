import { randomUUID } from "node:crypto";

import express from "express";
import { Worker } from "bullmq";

import { buildClaudeAgentEnv, initRuntimeSettings } from "@anchordesk/db";
import { serializeErrorForLog } from "@anchordesk/logging";
import { QUEUE_NAMES, getRedisConnection } from "@anchordesk/queue";

import { logger } from "./logger";
import { processConversationResponseJob } from "./process-conversation-job";
import { runAgentResponse } from "./run-agent-response";
import { buildClaudeAgentRuntimeLogContext } from "./runtime-log";

const BULLMQ_WORKER_EVENT = {
  FAILED: "failed",
} as const;

async function main() {
  await initRuntimeSettings();

  const port = Number(process.env.PORT ?? 4001);
  const app = express();
  app.use(express.json());

  logger.info(
    {
      port,
      respondQueue: QUEUE_NAMES.respond,
      ...buildClaudeAgentRuntimeLogContext(buildClaudeAgentEnv()),
    },
    "agent runtime bootstrapped",
  );

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/respond", async (req, res) => {
    const requestId = String(req.header("x-request-id") ?? "").trim() || randomUUID();
    const requestLogger = logger.child({
      requestId,
      method: req.method,
      path: req.path,
    });
    const prompt = String(req.body?.prompt ?? "").trim();
    const workspaceId = String(req.body?.workspaceId ?? "").trim();
    const conversationId = String(req.body?.conversationId ?? "").trim();
    const agentSessionId = String(req.body?.agentSessionId ?? "").trim() || undefined;
    const requestedWorkdir = String(req.body?.agentWorkdir ?? "").trim() || undefined;
    const startedAt = Date.now();

    res.setHeader("x-request-id", requestId);

    if (!prompt || !workspaceId || !conversationId) {
      requestLogger.warn(
        {
          conversationId: conversationId || null,
          workspaceId: workspaceId || null,
          promptLength: prompt.length,
          hasAgentSessionId: Boolean(agentSessionId),
          hasRequestedWorkdir: Boolean(requestedWorkdir),
        },
        "agent response request rejected due to missing required fields",
      );
      res
        .status(400)
        .json({ ok: false, error: "prompt, workspaceId, and conversationId are required" });
      return;
    }

    requestLogger.info(
      {
        conversationId,
        workspaceId,
        promptLength: prompt.length,
        hasAgentSessionId: Boolean(agentSessionId),
        hasRequestedWorkdir: Boolean(requestedWorkdir),
      },
      "agent response request started",
    );

    try {
      const result = await runAgentResponse({
        prompt,
        workspaceId,
        conversationId,
        agentSessionId,
        agentWorkdir: requestedWorkdir,
      });

      requestLogger.info(
        {
          conversationId,
          workspaceId,
          sessionId: result.sessionId ?? null,
          citationCount: Array.isArray(result.citations) ? result.citations.length : 0,
          outputLength: result.text.length,
          durationMs: Date.now() - startedAt,
        },
        "agent response request completed",
      );

      res.json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown agent runtime error";
      requestLogger.error(
        {
          conversationId,
          workspaceId,
          durationMs: Date.now() - startedAt,
          error: serializeErrorForLog(error),
        },
        "agent response request failed",
      );
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

  respondWorker.on(BULLMQ_WORKER_EVENT.FAILED, (job, error) => {
    logger.error(
      {
        jobId: job?.id ?? null,
        conversationId:
          job?.data && typeof job.data.conversationId === "string"
            ? job.data.conversationId
            : null,
        assistantMessageId:
          job?.data && typeof job.data.assistantMessageId === "string"
            ? job.data.assistantMessageId
            : null,
        error: serializeErrorForLog(error),
      },
      "agent runtime queue worker failed",
    );
  });

  app.listen(port, () => {
    logger.info({ port }, "agent runtime listening");
  });
}

main().catch((error) => {
  logger.fatal({ error: serializeErrorForLog(error) }, "agent runtime startup failed");
  process.exit(1);
});
