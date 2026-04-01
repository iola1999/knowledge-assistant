import { FlowProducer, Queue, type JobsOptions } from "bullmq";
import {
  DEFAULT_DOCUMENT_INDEXING_MODE,
  DEFAULT_QUEUE_JOB_RETENTION_LIMIT,
  DOCUMENT_INDEXING_MODE,
  type DocumentIndexingMode,
} from "@anchordesk/contracts";
import { injectTraceContextHeaders, type TraceContextHeaders } from "@anchordesk/tracing";

export const QUEUE_NAMES = {
  respond: "conversation.respond",
  parse: "document.parse",
  chunk: "document.chunk",
  embed: "document.embed",
  index: "document.index",
} as const;

export type IngestJobPayload = {
  workspaceId?: string | null;
  libraryId?: string;
  documentId: string;
  documentVersionId: string;
  indexingMode?: DocumentIndexingMode;
  traceContext?: TraceContextHeaders | null;
};

export type ConversationResponseJobPayload = {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  runId: string;
  modelProfileId?: string;
  prompt: string;
  draftUploadId?: string | null;
  traceContext?: TraceContextHeaders | null;
};

export function withEnqueuedTraceContext<T extends Record<string, unknown>>(
  payload: T & { traceContext?: TraceContextHeaders | null },
) {
  if (payload.traceContext !== undefined) {
    return payload;
  }

  return {
    ...payload,
    traceContext: injectTraceContextHeaders(),
  };
}

export function sanitizeQueueJobIdPart(value: string) {
  return value.trim().replace(/:/g, "_");
}

export function buildQueueJobId(...parts: string[]) {
  return parts
    .map((part) => sanitizeQueueJobIdPart(part))
    .filter(Boolean)
    .join("--");
}

export function getRedisConnection() {
  return {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
  };
}

export function createFlowProducer() {
  return new FlowProducer({
    connection: getRedisConnection(),
  });
}

export function createQueue(name: (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES]) {
  return new Queue(name, {
    connection: getRedisConnection(),
  });
}

export async function enqueueIngestFlow(
  payload: IngestJobPayload,
  options?: JobsOptions,
) {
  const producer = createFlowProducer();
  const payloadWithTraceContext = withEnqueuedTraceContext(payload);
  const indexingMode =
    payloadWithTraceContext.indexingMode ?? DEFAULT_DOCUMENT_INDEXING_MODE;

  return producer.add({
    name: QUEUE_NAMES.index,
    queueName: QUEUE_NAMES.index,
    data: {
      ...payloadWithTraceContext,
      indexingMode,
    },
    opts: {
      jobId: buildQueueJobId(payload.documentVersionId, "index"),
      removeOnComplete: DEFAULT_QUEUE_JOB_RETENTION_LIMIT,
      removeOnFail: DEFAULT_QUEUE_JOB_RETENTION_LIMIT,
      ...options,
    },
    children:
      indexingMode === DOCUMENT_INDEXING_MODE.PARSE_ONLY
        ? [
            {
              name: QUEUE_NAMES.chunk,
              queueName: QUEUE_NAMES.chunk,
                data: {
                ...payloadWithTraceContext,
                indexingMode,
              },
              opts: {
                jobId: buildQueueJobId(payload.documentVersionId, "chunk"),
                removeOnComplete: DEFAULT_QUEUE_JOB_RETENTION_LIMIT,
                removeOnFail: DEFAULT_QUEUE_JOB_RETENTION_LIMIT,
              },
              children: [
                {
                  name: QUEUE_NAMES.parse,
                  queueName: QUEUE_NAMES.parse,
                  data: {
                    ...payloadWithTraceContext,
                    indexingMode,
                  },
                  opts: {
                    jobId: buildQueueJobId(payload.documentVersionId, "parse"),
                    removeOnComplete: DEFAULT_QUEUE_JOB_RETENTION_LIMIT,
                    removeOnFail: DEFAULT_QUEUE_JOB_RETENTION_LIMIT,
                  },
                },
              ],
            },
          ]
        : [
            {
              name: QUEUE_NAMES.embed,
              queueName: QUEUE_NAMES.embed,
              data: {
                ...payloadWithTraceContext,
                indexingMode,
              },
              opts: {
                jobId: buildQueueJobId(payload.documentVersionId, "embed"),
                removeOnComplete: DEFAULT_QUEUE_JOB_RETENTION_LIMIT,
                removeOnFail: DEFAULT_QUEUE_JOB_RETENTION_LIMIT,
              },
              children: [
                {
                  name: QUEUE_NAMES.chunk,
                  queueName: QUEUE_NAMES.chunk,
                  data: {
                    ...payloadWithTraceContext,
                    indexingMode,
                  },
                  opts: {
                    jobId: buildQueueJobId(payload.documentVersionId, "chunk"),
                    removeOnComplete: DEFAULT_QUEUE_JOB_RETENTION_LIMIT,
                    removeOnFail: DEFAULT_QUEUE_JOB_RETENTION_LIMIT,
                  },
                  children: [
                    {
                      name: QUEUE_NAMES.parse,
                      queueName: QUEUE_NAMES.parse,
                        data: {
                        ...payloadWithTraceContext,
                        indexingMode,
                      },
                      opts: {
                        jobId: buildQueueJobId(payload.documentVersionId, "parse"),
                        removeOnComplete: DEFAULT_QUEUE_JOB_RETENTION_LIMIT,
                        removeOnFail: DEFAULT_QUEUE_JOB_RETENTION_LIMIT,
                      },
                    },
                  ],
                },
              ],
            },
          ],
  });
}

export async function enqueueConversationResponse(
  payload: ConversationResponseJobPayload,
  options?: JobsOptions,
) {
  const queue = createQueue(QUEUE_NAMES.respond);
  const payloadWithTraceContext = withEnqueuedTraceContext(payload);

  return queue.add(QUEUE_NAMES.respond, payloadWithTraceContext, {
    jobId: buildQueueJobId(
      payloadWithTraceContext.assistantMessageId,
      payloadWithTraceContext.runId,
      "respond",
    ),
    removeOnComplete: DEFAULT_QUEUE_JOB_RETENTION_LIMIT,
    removeOnFail: DEFAULT_QUEUE_JOB_RETENTION_LIMIT,
    ...options,
  });
}

export * from "./conversation-events";
