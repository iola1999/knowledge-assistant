import Redis from "ioredis";

import { getRedisConnection } from "@anchordesk/queue";

export const AUTH_SESSION_REDIS_KEY_PREFIX = "auth:session";
export const AUTH_USER_SESSIONS_REDIS_KEY_PREFIX = "auth:user-sessions";

export type AuthSessionStore = {
  exists: (key: string) => Promise<number>;
  set: (key: string, value: string, mode: "EX", seconds: number) => Promise<unknown>;
  expire: (key: string, seconds: number) => Promise<number>;
  del: (...keys: string[]) => Promise<number>;
  sadd: (key: string, ...members: string[]) => Promise<number>;
  srem: (key: string, ...members: string[]) => Promise<number>;
  smembers: (key: string) => Promise<string[]>;
};

export type AuthSessionRecordInput = {
  sessionId: string;
  userId: string;
  maxAgeSeconds: number;
  store?: AuthSessionStore;
};

let authSessionStore: AuthSessionStore | null = null;

function getAuthSessionStore(): AuthSessionStore {
  if (!authSessionStore) {
    authSessionStore = new Redis(getRedisConnection().url);
  }
  return authSessionStore;
}

export function buildAuthSessionRedisKey(sessionId: string) {
  return `${AUTH_SESSION_REDIS_KEY_PREFIX}:${sessionId}`;
}

export function buildAuthUserSessionsRedisKey(userId: string) {
  return `${AUTH_USER_SESSIONS_REDIS_KEY_PREFIX}:${userId}`;
}

export async function registerAuthSession(input: AuthSessionRecordInput) {
  const store = input.store ?? getAuthSessionStore();
  const sessionKey = buildAuthSessionRedisKey(input.sessionId);
  const userSessionsKey = buildAuthUserSessionsRedisKey(input.userId);

  await store.set(sessionKey, input.userId, "EX", input.maxAgeSeconds);
  await store.sadd(userSessionsKey, input.sessionId);
  await store.expire(userSessionsKey, input.maxAgeSeconds);
}

export async function touchAuthSession(input: AuthSessionRecordInput) {
  const store = input.store ?? getAuthSessionStore();
  const sessionKey = buildAuthSessionRedisKey(input.sessionId);
  const userSessionsKey = buildAuthUserSessionsRedisKey(input.userId);
  const exists = await store.exists(sessionKey);

  if (exists !== 1) {
    return false;
  }

  await store.expire(sessionKey, input.maxAgeSeconds);
  await store.sadd(userSessionsKey, input.sessionId);
  await store.expire(userSessionsKey, input.maxAgeSeconds);

  return true;
}

export async function revokeAuthSession(input: {
  sessionId: string;
  userId?: string;
  store?: AuthSessionStore;
}) {
  const store = input.store ?? getAuthSessionStore();
  const sessionKey = buildAuthSessionRedisKey(input.sessionId);

  await store.del(sessionKey);
  if (input.userId) {
    await store.srem(buildAuthUserSessionsRedisKey(input.userId), input.sessionId);
  }
}

export async function revokeUserSessions(input: { userId: string; store?: AuthSessionStore }) {
  const store = input.store ?? getAuthSessionStore();
  const userSessionsKey = buildAuthUserSessionsRedisKey(input.userId);
  const sessionIds = await store.smembers(userSessionsKey);

  if (sessionIds.length > 0) {
    await store.del(...sessionIds.map((sessionId) => buildAuthSessionRedisKey(sessionId)));
  }
  await store.del(userSessionsKey);

  return sessionIds.length;
}
