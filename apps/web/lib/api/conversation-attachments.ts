export const TEMPORARY_ATTACHMENT_ROOT_DIRECTORY = "资料库/临时目录";
export const DRAFT_ATTACHMENT_EXPIRY_HOURS = 24;

export type ComposerAttachmentStatus =
  | "presigning"
  | "uploading"
  | "creating"
  | "parsing"
  | "ready"
  | "failed";

function sanitizeToken(value: string) {
  const normalized = value.replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 8);
  return normalized || "session";
}

export function buildTemporaryAttachmentDirectory(input: {
  draftUploadId?: string | null;
  conversationId?: string | null;
  attachmentKey?: string | null;
}) {
  const scope =
    input.conversationId?.trim()
      ? `会话-${sanitizeToken(input.conversationId)}`
      : `草稿-${sanitizeToken(input.draftUploadId ?? "")}`;
  const attachmentKey = sanitizeToken(input.attachmentKey ?? "");

  return `${TEMPORARY_ATTACHMENT_ROOT_DIRECTORY}/${scope}/附件-${attachmentKey}`;
}

export function buildTemporaryAttachmentLogicalPath(input: {
  directoryPath: string;
  sourceFilename: string;
}) {
  return `${input.directoryPath.replace(/\/+$/g, "")}/${input.sourceFilename.replace(/^\/+/g, "")}`.replace(
    /\/+/g,
    "/",
  );
}

export function buildDraftAttachmentExpiryDate(now = new Date()) {
  return new Date(now.getTime() + DRAFT_ATTACHMENT_EXPIRY_HOURS * 60 * 60 * 1000);
}

export function canSubmitWithAttachments(statuses: ComposerAttachmentStatus[]) {
  return statuses.every((status) => status === "ready" || status === "failed");
}

export function hasReadyAttachments(statuses: ComposerAttachmentStatus[]) {
  return statuses.some((status) => status === "ready");
}

export function resolveComposerAttachmentStatus(input: {
  jobStatus?: string | null;
  parseStage?: string | null;
}) {
  if (input.jobStatus === "failed" || input.parseStage === "failed") {
    return "failed" as const;
  }

  if (input.jobStatus === "completed" || input.parseStage === "ready") {
    return "ready" as const;
  }

  return "parsing" as const;
}
