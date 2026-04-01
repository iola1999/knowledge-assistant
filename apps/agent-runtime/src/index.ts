import { randomUUID } from "node:crypto";

import express from "express";
import { Worker } from "bullmq";

import {
  buildClaudeAgentEnv,
  initRuntimeSettings,
  resolveDefaultUsableModelProfile,
  resolveUsableModelProfileById,
} from "@anchordesk/db";
import { serializeErrorForLog } from "@anchordesk/logging";
import { QUEUE_NAMES, getRedisConnection } from "@anchordesk/queue";
import { startNodeTracing, withServerSpan } from "@anchordesk/tracing";

import { logger } from "./logger";
import { processConversationResponseJob } from "./process-conversation-job";
import { runAgentResponse } from "./run-agent-response";
import { buildClaudeAgentRuntimeLogContext } from "./runtime-log";
import { resolveRespondWorkerConcurrency } from "./runtime-config";
import { listActiveConversationRuns } from "./active-conversation-runs";
import { failConversationResponseRun } from "./conversation-run-failure";

const BULLMQ_WORKER_EVENT = {
  FAILED: "failed",
} as const;

const AGENT_RUNTIME_SHUTDOWN_SIGNAL = {
  SIGINT: "SIGINT",
  SIGTERM: "SIGTERM",
  SIGUSR2: "SIGUSR2",
} as const;

const AGENT_RUNTIME_SHUTDOWN_ERROR =
  "Agent Runtime 正在重启，当前回答未完成。请重新生成。";

async function main() {
  const tracing = startNodeTracing({
    serviceName: "anchordesk-agent-runtime",
  });
  await initRuntimeSettings();

  const port = Number(process.env.PORT ?? 4001);
  const respondWorkerConcurrency = resolveRespondWorkerConcurrency();
  const app = express();
  app.use(express.json());

  logger.info(
    {
      port,
      otlpTraceExporterUrl: tracing.otlpTraceExporterUrl,
      respondQueue: QUEUE_NAMES.respond,
      respondWorkerConcurrency,
      ...buildClaudeAgentRuntimeLogContext(buildClaudeAgentEnv()),
    },
    "agent runtime bootstrapped",
  );

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/respond", async (req, res) => {
    await withServerSpan(
      {
        carrier: req.headers as Record<string, string | string[] | undefined>,
        name: "POST /respond",
        attributes: {
          "http.method": req.method,
          "http.route": "/respond",
          "url.path": req.path,
        },
      },
      async () => {
        const requestId = String(req.header("x-request-id") ?? "").trim() || randomUUID();
        const requestLogger = logger.child({
          requestId,
          method: req.method,
          path: req.path,
        });
        const prompt = String(req.body?.prompt ?? "").trim();
        const workspaceId = String(req.body?.workspaceId ?? "").trim();
        const conversationId = String(req.body?.conversationId ?? "").trim();
        const modelProfileId = String(req.body?.modelProfileId ?? "").trim() || undefined;
        const agentSessionId = String(req.body?.agentSessionId ?? "").trim() || undefined;
        const requestedWorkdir = String(req.body?.agentWorkdir ?? "").trim() || undefined;
        const startedAt = Date.now();

        res.setHeader("x-request-id", requestId);

        if (!prompt || !workspaceId || !conversationId) {
          requestLogger.warn(
            {
              conversationId: conversationId || null,
              modelProfileId: modelProfileId ?? null,
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
            modelProfileId: modelProfileId ?? null,
            workspaceId,
            promptLength: prompt.length,
            hasAgentSessionId: Boolean(agentSessionId),
            hasRequestedWorkdir: Boolean(requestedWorkdir),
          },
          "agent response request started",
        );

        try {
          const modelProfile = modelProfileId
            ? await resolveUsableModelProfileById(modelProfileId)
            : await resolveDefaultUsableModelProfile();
          const result = await runAgentResponse({
            prompt,
            workspaceId,
            conversationId,
            modelProfile,
            agentSessionId,
            agentWorkdir: requestedWorkdir,
          });

          requestLogger.info(
            {
              conversationId,
              modelProfileId: modelProfile.id,
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
              modelProfileId: modelProfileId ?? null,
              workspaceId,
              durationMs: Date.now() - startedAt,
              error: serializeErrorForLog(error),
            },
            "agent response request failed",
          );
          res.status(500).json({ ok: false, error: message });
        }
      },
    );
  });

  const respondWorker = new Worker(
    QUEUE_NAMES.respond,
    async (job) => {
      await processConversationResponseJob(job.data);
    },
    {
      connection: getRedisConnection(),
      concurrency: respondWorkerConcurrency,
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

  const server = app.listen(port, () => {
    logger.info({ port }, "agent runtime listening");
  });

  let shutdownPromise: Promise<void> | null = null;
  const shutdownSignals = Object.values(AGENT_RUNTIME_SHUTDOWN_SIGNAL);

  const shutdownRuntime = async (signal: NodeJS.Signals) => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shutdownPromise = (async () => {
      const activeRuns = listActiveConversationRuns();
      logger.warn(
        {
          signal,
          activeRunCount: activeRuns.length,
        },
        "agent runtime shutdown requested",
      );

      await Promise.allSettled(
        activeRuns.map((run) =>
          failConversationResponseRun({
            conversationId: run.conversationId,
            assistantMessageId: run.assistantMessageId,
            runId: run.runId,
            error: AGENT_RUNTIME_SHUTDOWN_ERROR,
          }),
        ),
      );

      await Promise.allSettled([
        respondWorker.close(true),
        new Promise<void>((resolve) => {
          server.close(() => {
            resolve();
          });
        }),
      ]);
    })();

    try {
      await shutdownPromise;
      process.exit(0);
    } catch (error) {
      logger.error(
        {
          signal,
          error: serializeErrorForLog(error),
        },
        "agent runtime shutdown failed",
      );
      process.exit(1);
    }
  };

  for (const signal of shutdownSignals) {
    process.on(signal, () => {
      void shutdownRuntime(signal);
    });
  }
}

main().catch((error) => {
  logger.fatal({ error: serializeErrorForLog(error) }, "agent runtime startup failed");
  process.exit(1);
});
