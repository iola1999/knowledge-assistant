import { asc, desc, eq } from "drizzle-orm";

import {
  MODEL_PROFILE_API_TYPE,
  type ModelProfileApiType,
} from "@anchordesk/contracts";

import { getDb } from "./client";
import { conversations, llmModelProfiles } from "./schema";

type DbLike = ReturnType<typeof getDb>;

export type ModelProfileRecord = {
  id: string;
  apiType: ModelProfileApiType;
  displayName: string;
  modelName: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  isDefault: boolean;
};

export type EnabledModelProfileSummary = Pick<
  ModelProfileRecord,
  "id" | "displayName" | "modelName" | "isDefault"
>;

function normalizeModelProfileText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

export function normalizeModelProfileRecord(
  record: ModelProfileRecord,
): ModelProfileRecord {
  return {
    ...record,
    displayName: normalizeModelProfileText(record.displayName),
    modelName: normalizeModelProfileText(record.modelName),
    baseUrl: normalizeModelProfileText(record.baseUrl),
    apiKey: normalizeModelProfileText(record.apiKey),
  };
}

export function formatModelProfileLabel(
  profile: Pick<ModelProfileRecord, "displayName" | "modelName">,
) {
  return normalizeModelProfileText(profile.displayName) || normalizeModelProfileText(profile.modelName);
}

export function assertModelProfileSelectable(
  profile: ModelProfileRecord | null | undefined,
): ModelProfileRecord {
  if (!profile) {
    throw new Error("Selected model profile does not exist.");
  }

  const normalized = normalizeModelProfileRecord(profile);
  if (!normalized.enabled) {
    throw new Error("Selected model profile is disabled.");
  }

  return normalized;
}

export function assertModelProfileUsable(
  profile: ModelProfileRecord | null | undefined,
): ModelProfileRecord {
  const normalized = assertModelProfileSelectable(profile);

  if (normalized.apiType !== MODEL_PROFILE_API_TYPE.ANTHROPIC) {
    throw new Error("Selected model profile uses an unsupported API type.");
  }

  if (!normalized.modelName) {
    throw new Error("Model profile name is not configured.");
  }

  if (!normalized.baseUrl) {
    throw new Error("Model profile base URL is not configured.");
  }

  if (!normalized.apiKey) {
    throw new Error("Model profile API key is not configured.");
  }

  return normalized;
}

async function readModelProfile(
  where:
    | { id: string }
    | { isDefault: true },
  db: DbLike = getDb(),
) {
  const baseQuery = db
    .select({
      id: llmModelProfiles.id,
      apiType: llmModelProfiles.apiType,
      displayName: llmModelProfiles.displayName,
      modelName: llmModelProfiles.modelName,
      baseUrl: llmModelProfiles.baseUrl,
      apiKey: llmModelProfiles.apiKey,
      enabled: llmModelProfiles.enabled,
      isDefault: llmModelProfiles.isDefault,
    })
    .from(llmModelProfiles);

  const rows =
    "id" in where
      ? await baseQuery.where(eq(llmModelProfiles.id, where.id)).limit(1)
      : await baseQuery.where(eq(llmModelProfiles.isDefault, true)).limit(1);

  const row = rows[0];
  return row ? normalizeModelProfileRecord(row) : null;
}

export async function findModelProfileById(
  modelProfileId: string,
  db: DbLike = getDb(),
) {
  return readModelProfile({ id: modelProfileId }, db);
}

export async function findDefaultModelProfile(db: DbLike = getDb()) {
  return readModelProfile({ isDefault: true }, db);
}

export async function listModelProfiles(db: DbLike = getDb()) {
  const rows = await db
    .select({
      id: llmModelProfiles.id,
      apiType: llmModelProfiles.apiType,
      displayName: llmModelProfiles.displayName,
      modelName: llmModelProfiles.modelName,
      baseUrl: llmModelProfiles.baseUrl,
      apiKey: llmModelProfiles.apiKey,
      enabled: llmModelProfiles.enabled,
      isDefault: llmModelProfiles.isDefault,
    })
    .from(llmModelProfiles)
    .orderBy(
      desc(llmModelProfiles.isDefault),
      desc(llmModelProfiles.enabled),
      asc(llmModelProfiles.displayName),
      asc(llmModelProfiles.modelName),
    );

  return rows.map((row) => normalizeModelProfileRecord(row));
}

export async function listEnabledModelProfiles(db: DbLike = getDb()) {
  const rows = await db
    .select({
      id: llmModelProfiles.id,
      displayName: llmModelProfiles.displayName,
      modelName: llmModelProfiles.modelName,
      isDefault: llmModelProfiles.isDefault,
    })
    .from(llmModelProfiles)
    .where(eq(llmModelProfiles.enabled, true))
    .orderBy(
      desc(llmModelProfiles.isDefault),
      asc(llmModelProfiles.displayName),
      asc(llmModelProfiles.modelName),
    );

  return rows.map((row) => ({
    ...row,
    displayName: normalizeModelProfileText(row.displayName),
    modelName: normalizeModelProfileText(row.modelName),
  }));
}

export async function resolveSelectedModelProfile(
  input: {
    requestedModelProfileId?: string | null;
    conversationModelProfileId?: string | null;
  },
  db: DbLike = getDb(),
) {
  const requestedModelProfileId = normalizeModelProfileText(input.requestedModelProfileId);
  if (requestedModelProfileId) {
    return assertModelProfileSelectable(
      await findModelProfileById(requestedModelProfileId, db),
    );
  }

  const conversationModelProfileId = normalizeModelProfileText(
    input.conversationModelProfileId,
  );
  if (conversationModelProfileId) {
    return assertModelProfileSelectable(
      await findModelProfileById(conversationModelProfileId, db),
    );
  }

  const defaultProfile = await findDefaultModelProfile(db);
  if (!defaultProfile) {
    throw new Error("Default model profile is not configured.");
  }

  return assertModelProfileSelectable(defaultProfile);
}

export async function resolveUsableModelProfileById(
  modelProfileId: string,
  db: DbLike = getDb(),
) {
  return assertModelProfileUsable(await findModelProfileById(modelProfileId, db));
}

export async function resolveDefaultUsableModelProfile(db: DbLike = getDb()) {
  const defaultProfile = await findDefaultModelProfile(db);
  if (!defaultProfile) {
    throw new Error("Default model profile is not configured.");
  }

  return assertModelProfileUsable(defaultProfile);
}

export async function loadConversationModelProfileId(
  conversationId: string,
  db: DbLike = getDb(),
) {
  const rows = await db
    .select({
      modelProfileId: conversations.modelProfileId,
    })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  return normalizeModelProfileText(rows[0]?.modelProfileId) || null;
}

export async function syncConversationModelProfileId(
  input: {
    conversationId: string;
    modelProfileId: string;
  },
  db: DbLike = getDb(),
) {
  await db
    .update(conversations)
    .set({
      modelProfileId: input.modelProfileId,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, input.conversationId));
}
