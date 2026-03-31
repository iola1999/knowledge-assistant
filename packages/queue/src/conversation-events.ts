import Redis from "ioredis";

import {
  conversationStreamEventSchema,
  type ConversationStreamEvent,
} from "@anchordesk/contracts";

const CONVERSATION_STREAM_KEY_PREFIX = "conversation:stream";
const CONVERSATION_STREAM_MAXLEN = 2048;
const CONVERSATION_STREAM_TTL_SECONDS = 60 * 60 * 24;

export type ConversationStreamRecord = {
  id: string;
  event: ConversationStreamEvent;
};

let redisCommandClient: Redis | null = null;

function readPayloadField(fields: string[]) {
  for (let index = 0; index < fields.length; index += 2) {
    if (fields[index] === "payload") {
      return fields[index + 1] ?? null;
    }
  }

  return null;
}

function parseConversationStreamRecords(value: unknown): ConversationStreamRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const records: ConversationStreamRecord[] = [];

  for (const stream of value) {
    if (!Array.isArray(stream) || stream.length < 2) {
      continue;
    }

    const entries = stream[1];
    if (!Array.isArray(entries)) {
      continue;
    }

    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length < 2 || typeof entry[0] !== "string") {
        continue;
      }

      const payload = readPayloadField(
        Array.isArray(entry[1])
          ? entry[1].filter((item): item is string => typeof item === "string")
          : [],
      );

      if (!payload) {
        continue;
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(payload) as unknown;
      } catch {
        continue;
      }

      const parsedEvent = conversationStreamEventSchema.safeParse(parsedJson);

      if (!parsedEvent.success) {
        continue;
      }

      records.push({
        id: entry[0],
        event: parsedEvent.data,
      });
    }
  }

  return records;
}

export function buildConversationStreamKey(assistantMessageId: string, runId: string) {
  return `${CONVERSATION_STREAM_KEY_PREFIX}:${assistantMessageId}:${runId}`;
}

export function createRedisClient() {
  return new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
}

export function getRedisCommandClient() {
  if (!redisCommandClient) {
    redisCommandClient = createRedisClient();
  }

  return redisCommandClient;
}

export async function appendConversationStreamEvent(input: {
  assistantMessageId: string;
  runId: string;
  event: ConversationStreamEvent;
}) {
  const redis = getRedisCommandClient();
  const key = buildConversationStreamKey(input.assistantMessageId, input.runId);
  const payload = JSON.stringify(input.event);
  const streamId = await redis.xadd(
    key,
    "MAXLEN",
    "~",
    String(CONVERSATION_STREAM_MAXLEN),
    "*",
    "payload",
    payload,
  );

  await redis.expire(key, CONVERSATION_STREAM_TTL_SECONDS);
  return streamId;
}

export async function readConversationStreamEvents(input: {
  assistantMessageId: string;
  runId: string;
  afterId?: string | null;
  blockMs?: number;
  count?: number;
  redis?: Redis;
}) {
  const redis = input.redis ?? getRedisCommandClient();
  const args: string[] = [];

  if (typeof input.count === "number" && Number.isFinite(input.count)) {
    args.push("COUNT", String(input.count));
  }

  if (typeof input.blockMs === "number" && Number.isFinite(input.blockMs)) {
    args.push("BLOCK", String(input.blockMs));
  }

  args.push(
    "STREAMS",
    buildConversationStreamKey(input.assistantMessageId, input.runId),
    input.afterId?.trim() || "0-0",
  );

  const raw = await redis.call("xread", ...args);
  return parseConversationStreamRecords(raw);
}
