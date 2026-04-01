const SUPPORTED_UPLOAD_EXTENSIONS = new Set([
  ".pdf",
  ".docx",
  ".txt",
  ".md",
  ".markdown",
]);

const IMAGE_UPLOAD_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
]);

const SUPPORTED_UPLOAD_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
]);

export const SUPPORTED_UPLOAD_TYPES_LABEL = "PDF、DOCX、TXT、Markdown";

export const SUPPORTED_UPLOAD_ACCEPT = [
  ".pdf",
  ".docx",
  ".txt",
  ".md",
  ".markdown",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
].join(",");

export const IMAGE_UPLOAD_DISABLED_MESSAGE =
  "当前暂不支持直接上传图片。若是扫描件，请导出为 PDF 后上传；系统会只在无原生文本且含图的 PDF 页上自动走 OCR。";

export const UNSUPPORTED_UPLOAD_MESSAGE = `当前仅支持 ${SUPPORTED_UPLOAD_TYPES_LABEL} 上传。`;

export type UploadSupportResult =
  | {
      ok: true;
      normalizedContentType: string | null;
    }
  | {
      ok: false;
      code: "image_requires_ocr" | "unsupported_type";
      message: string;
    };

export type UploadCandidate = {
  filename: string;
  contentType?: string | null;
};

export type UnsupportedUploadCandidate<T extends UploadCandidate = UploadCandidate> = {
  input: T;
  code: "image_requires_ocr" | "unsupported_type";
  message: string;
};

function getFilenameExtension(filename: string) {
  const normalized = String(filename ?? "").trim().toLowerCase();
  const extensionIndex = normalized.lastIndexOf(".");

  return extensionIndex >= 0 ? normalized.slice(extensionIndex) : "";
}

function normalizeContentType(contentType: string | null | undefined) {
  const normalized = String(contentType ?? "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return normalized.split(";")[0]?.trim() || null;
}

export function validateUploadSupport(input: UploadCandidate): UploadSupportResult {
  const extension = getFilenameExtension(input.filename);
  const normalizedContentType = normalizeContentType(input.contentType);

  if (
    IMAGE_UPLOAD_EXTENSIONS.has(extension) ||
    normalizedContentType?.startsWith("image/")
  ) {
    return {
      ok: false,
      code: "image_requires_ocr",
      message: IMAGE_UPLOAD_DISABLED_MESSAGE,
    };
  }

  if (
    SUPPORTED_UPLOAD_EXTENSIONS.has(extension) ||
    (normalizedContentType !== null &&
      SUPPORTED_UPLOAD_MIME_TYPES.has(normalizedContentType))
  ) {
    return {
      ok: true,
      normalizedContentType,
    };
  }

  return {
    ok: false,
    code: "unsupported_type",
    message: UNSUPPORTED_UPLOAD_MESSAGE,
  };
}

export function collectUnsupportedUploads<T extends UploadCandidate>(
  inputs: readonly T[],
): UnsupportedUploadCandidate<T>[] {
  return inputs.flatMap((input) => {
    const support = validateUploadSupport(input);

    return support.ok
      ? []
      : [
          {
            input,
            code: support.code,
            message: support.message,
          },
        ];
  });
}
