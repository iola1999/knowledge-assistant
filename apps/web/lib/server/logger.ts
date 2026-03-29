import { randomUUID } from "node:crypto";

import { createServiceLogger } from "@anchordesk/logging";

export const logger = createServiceLogger({ service: "web" });

function normalizeHeaderValue(value: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function resolveRequestId(request: Request) {
  return normalizeHeaderValue(request.headers.get("x-request-id")) ?? randomUUID();
}

export function buildRequestLogContext(request: Request, requestId: string) {
  const url = new URL(request.url);

  return {
    requestId,
    method: request.method,
    path: url.pathname,
  };
}
