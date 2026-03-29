import { PARSE_STATUS, RUN_STATUS } from "@anchordesk/contracts";

export const TEMPORARY_ATTACHMENT_ROOT_DIRECTORY = "资料库/临时目录";
export const DRAFT_ATTACHMENT_EXPIRY_HOURS = 24;

type ValueOf<T> = T[keyof T];

export const COMPOSER_ATTACHMENT_STATUS = {
  PRESIGNING: "presigning",
  UPLOADING: "uploading",
  CREATING: "creating",
  PARSING: "parsing",
  READY: "ready",
  FAILED: "failed",
} as const;
export const COMPOSER_ATTACHMENT_STATUS_VALUES = [
  COMPOSER_ATTACHMENT_STATUS.PRESIGNING,
  COMPOSER_ATTACHMENT_STATUS.UPLOADING,
  COMPOSER_ATTACHMENT_STATUS.CREATING,
  COMPOSER_ATTACHMENT_STATUS.PARSING,
  COMPOSER_ATTACHMENT_STATUS.READY,
  COMPOSER_ATTACHMENT_STATUS.FAILED,
] as const;
export type ComposerAttachmentStatus = ValueOf<typeof COMPOSER_ATTACHMENT_STATUS>;

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
  return statuses.every(
    (status) =>
      status === COMPOSER_ATTACHMENT_STATUS.READY ||
      status === COMPOSER_ATTACHMENT_STATUS.FAILED,
  );
}

export function hasReadyAttachments(statuses: ComposerAttachmentStatus[]) {
  return statuses.some((status) => status === COMPOSER_ATTACHMENT_STATUS.READY);
}

export function resolveComposerAttachmentStatus(input: {
  jobStatus?: string | null;
  parseStage?: string | null;
}) {
  if (
    input.jobStatus === RUN_STATUS.FAILED ||
    input.parseStage === PARSE_STATUS.FAILED
  ) {
    return COMPOSER_ATTACHMENT_STATUS.FAILED;
  }

  if (
    input.jobStatus === RUN_STATUS.COMPLETED ||
    input.parseStage === PARSE_STATUS.READY
  ) {
    return COMPOSER_ATTACHMENT_STATUS.READY;
  }

  return COMPOSER_ATTACHMENT_STATUS.PARSING;
}
