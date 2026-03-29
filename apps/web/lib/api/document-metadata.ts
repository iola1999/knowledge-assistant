import { z } from "zod";
import {
  buildCitationReferenceLabel,
  type CitationLocator,
  DOCUMENT_TYPE,
  DOCUMENT_TYPE_VALUES,
  type DocumentType,
} from "@anchordesk/contracts";
import { normalizeDirectoryPath } from "./directory-paths";

export const documentTypeOptions = [
  { value: DOCUMENT_TYPE.REFERENCE, label: "参考资料" },
  { value: DOCUMENT_TYPE.GUIDE, label: "指南手册" },
  { value: DOCUMENT_TYPE.POLICY, label: "制度政策" },
  { value: DOCUMENT_TYPE.SPEC, label: "规格说明" },
  { value: DOCUMENT_TYPE.REPORT, label: "报告" },
  { value: DOCUMENT_TYPE.NOTE, label: "笔记" },
  { value: DOCUMENT_TYPE.EMAIL, label: "邮件" },
  { value: DOCUMENT_TYPE.MEETING_NOTE, label: "会议纪要" },
  { value: DOCUMENT_TYPE.OTHER, label: "其他" },
] as const;

export const documentTypeValues = DOCUMENT_TYPE_VALUES;

export const documentMetadataPatchSchema = z
  .object({
    title: z.string().min(1).optional(),
    directoryPath: z.string().optional(),
    docType: z.enum(documentTypeValues).optional(),
    tags: z.array(z.string()).optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.directoryPath !== undefined ||
      value.docType !== undefined ||
      value.tags !== undefined,
    {
      message: "At least one field must be provided",
    },
  );

export type DocumentMetadataPatch = z.infer<typeof documentMetadataPatchSchema>;
export type DocumentTypeValue = DocumentType;

type CurrentDocumentMetadata = {
  title: string;
  sourceFilename: string;
  directoryPath: string;
  logicalPath: string;
  docType: DocumentTypeValue;
  tags: string[];
};

function arraysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

function normalizeFilenamePart(value: string) {
  return value
    .trim()
    .replace(/[\\/]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\.+|\.+$/g, "");
}

export function normalizeDocumentTags(values: string[]) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, " ");
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

export function parseTagsInput(value: string) {
  return normalizeDocumentTags(value.split(/[,\n，]/g));
}

export function buildStoredFilename(title: string, currentSourceFilename: string) {
  const extensionMatch = currentSourceFilename.match(/(\.[^.]+)$/);
  const extension = extensionMatch?.[1] ?? "";
  const fallbackBaseName = currentSourceFilename.replace(/\.[^.]+$/, "");
  const normalizedTitle = normalizeFilenamePart(title) || fallbackBaseName;

  if (extension && normalizedTitle.toLowerCase().endsWith(extension.toLowerCase())) {
    return normalizedTitle;
  }

  return `${normalizedTitle}${extension}`;
}

export function buildDocumentTitle(sourceFilename: string) {
  return sourceFilename.replace(/\.[^.]+$/, "");
}

export function buildDocumentPath(directoryPath: string, sourceFilename: string) {
  return `${normalizeDirectoryPath(directoryPath)}/${sourceFilename.replace(/^\/+|\/+$/g, "")}`.replace(
    /\/+/g,
    "/",
  );
}

function readLocatorNumber(
  source: Record<string, unknown> | null | undefined,
  keys: string[],
) {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(1, Math.trunc(value));
    }
  }

  return null;
}

export function readCitationLocator(
  source: Record<string, unknown> | null | undefined,
): CitationLocator | null {
  const locator =
    source?.locator && typeof source.locator === "object"
      ? (source.locator as Record<string, unknown>)
      : source;
  if (!locator || typeof locator !== "object") {
    return null;
  }

  const result: CitationLocator = {
    lineStart: readLocatorNumber(locator, ["line_start", "lineStart"]),
    lineEnd: readLocatorNumber(locator, ["line_end", "lineEnd"]),
    pageLineStart: readLocatorNumber(locator, ["page_line_start", "pageLineStart"]),
    pageLineEnd: readLocatorNumber(locator, ["page_line_end", "pageLineEnd"]),
    blockIndex: readLocatorNumber(locator, ["block_index", "blockIndex"]),
  };

  return Object.values(result).some((value) => value !== null) ? result : null;
}

export function buildAnchorLabel(
  title: string,
  pageNo: number,
  locator?: CitationLocator | null,
  sectionLabel?: string | null,
) {
  return buildCitationReferenceLabel({
    subject: title,
    pageNo,
    locator,
    sectionLabel,
  });
}

export function buildMessageCitationLabel(
  documentPath: string,
  pageNo: number,
  locator?: CitationLocator | null,
  sectionLabel?: string | null,
) {
  return buildCitationReferenceLabel({
    subject: documentPath,
    pageNo,
    locator,
    sectionLabel,
  });
}

export function buildDocumentMetadataUpdate(
  current: CurrentDocumentMetadata,
  patch: DocumentMetadataPatch,
) {
  const sourceFilename =
    patch.title !== undefined
      ? buildStoredFilename(patch.title, current.sourceFilename)
      : current.sourceFilename;
  const title = buildDocumentTitle(sourceFilename);
  const directoryPath =
    patch.directoryPath !== undefined
      ? normalizeDirectoryPath(patch.directoryPath, current.directoryPath)
      : current.directoryPath;
  const logicalPath = buildDocumentPath(directoryPath, sourceFilename);
  const docType = patch.docType ?? current.docType;
  const tags = patch.tags ? normalizeDocumentTags(patch.tags) : current.tags;

  const pathChanged =
    sourceFilename !== current.sourceFilename ||
    directoryPath !== current.directoryPath ||
    logicalPath !== current.logicalPath;
  const searchPayloadChanged =
    pathChanged ||
    docType !== current.docType ||
    !arraysEqual(tags, current.tags);
  const metadataChanged =
    title !== current.title ||
    pathChanged ||
    docType !== current.docType ||
    !arraysEqual(tags, current.tags);

  return {
    title,
    sourceFilename,
    directoryPath,
    logicalPath,
    docType,
    tags,
    pathChanged,
    metadataChanged,
    searchPayloadChanged,
  };
}
