import { randomBytes } from "node:crypto";

export type ConversationShareRecord = {
  shareToken: string;
  revokedAt: Date | null;
};

export function generateConversationShareToken() {
  return randomBytes(18).toString("base64url");
}

export function isConversationShareActive(
  share: ConversationShareRecord | null | undefined,
) {
  return Boolean(share && !share.revokedAt);
}

export function buildConversationSharePath(shareToken: string) {
  return `/share/${shareToken}`;
}

export function buildConversationShareUrl(origin: string, shareToken: string) {
  return new URL(buildConversationSharePath(shareToken), origin).toString();
}

export function resolveConversationShareOrigin(
  request: Request,
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  const configuredAppUrl = env.APP_URL?.trim();
  if (configuredAppUrl) {
    return configuredAppUrl;
  }

  return new URL(request.url).origin;
}
