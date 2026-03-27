import { FlowProducer, type JobsOptions } from "bullmq";

export const QUEUE_NAMES = {
  parse: "document.parse",
  chunk: "document.chunk",
  embed: "document.embed",
  index: "document.index",
} as const;

export type IngestJobPayload = {
  workspaceId: string;
  documentId: string;
  documentVersionId: string;
};

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

export async function enqueueIngestFlow(
  payload: IngestJobPayload,
  options?: JobsOptions,
) {
  const producer = createFlowProducer();

  return producer.add({
    name: QUEUE_NAMES.index,
    queueName: QUEUE_NAMES.index,
    data: payload,
    opts: {
      jobId: `${payload.documentVersionId}:index`,
      removeOnComplete: 100,
      removeOnFail: 100,
      ...options,
    },
    children: [
      {
        name: QUEUE_NAMES.embed,
        queueName: QUEUE_NAMES.embed,
        data: payload,
        opts: {
          jobId: `${payload.documentVersionId}:embed`,
          removeOnComplete: 100,
          removeOnFail: 100,
        },
        children: [
          {
            name: QUEUE_NAMES.chunk,
            queueName: QUEUE_NAMES.chunk,
            data: payload,
            opts: {
              jobId: `${payload.documentVersionId}:chunk`,
              removeOnComplete: 100,
              removeOnFail: 100,
            },
            children: [
              {
                name: QUEUE_NAMES.parse,
                queueName: QUEUE_NAMES.parse,
                data: payload,
                opts: {
                  jobId: `${payload.documentVersionId}:parse`,
                  removeOnComplete: 100,
                  removeOnFail: 100,
                },
              },
            ],
          },
        ],
      },
    ],
  });
}
