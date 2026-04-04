export const DOCUMENT_UPLOAD_STEP = {
  PENDING: "pending",
  FINGERPRINTING: "fingerprinting",
  PRESIGNING: "presigning",
  UPLOADING: "uploading",
  CREATING_DOCUMENT: "creating_document",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
} as const;

export const DOCUMENT_UPLOAD_PRESIGN_EXPIRES_IN_SECONDS = 60 * 60;
export const DOCUMENT_UPLOAD_REQUEST_TIMEOUT_MS =
  DOCUMENT_UPLOAD_PRESIGN_EXPIRES_IN_SECONDS * 1000 - 5 * 60 * 1000;

export type DocumentUploadStep =
  (typeof DOCUMENT_UPLOAD_STEP)[keyof typeof DOCUMENT_UPLOAD_STEP];

export type DocumentUploadItem = {
  id: string;
  file: File;
  step: DocumentUploadStep;
  progress: number;
  errorMessage: string | null;
  sha256: string | null;
  storageKey: string | null;
  documentId: string | null;
  documentVersionId: string | null;
  documentJobId: string | null;
};

export function createDocumentUploadItems(files: File[]) {
  return files.map<DocumentUploadItem>((file, index) => ({
    id: `${file.name}-${file.lastModified}-${index}`,
    file,
    step: DOCUMENT_UPLOAD_STEP.PENDING,
    progress: 0,
    errorMessage: null,
    sha256: null,
    storageKey: null,
    documentId: null,
    documentVersionId: null,
    documentJobId: null,
  }));
}

export function updateDocumentUploadItem(
  items: DocumentUploadItem[],
  itemId: string,
  patch: Partial<DocumentUploadItem>,
) {
  return items.map((item) => (item.id === itemId ? { ...item, ...patch } : item));
}

export function getRetryableDocumentUploadItems(items: DocumentUploadItem[]) {
  return items.filter((item) => item.step === DOCUMENT_UPLOAD_STEP.FAILED);
}

export function getDocumentUploadStepLabel(item: {
  step: DocumentUploadStep;
  progress: number;
  errorMessage?: string | null;
}) {
  switch (item.step) {
    case DOCUMENT_UPLOAD_STEP.FINGERPRINTING:
      return "正在计算指纹";
    case DOCUMENT_UPLOAD_STEP.PRESIGNING:
      return "正在申请上传地址";
    case DOCUMENT_UPLOAD_STEP.UPLOADING:
      return `上传中 ${Math.min(100, Math.max(0, Math.round(item.progress)))}%`;
    case DOCUMENT_UPLOAD_STEP.CREATING_DOCUMENT:
      return "正在创建资料任务";
    case DOCUMENT_UPLOAD_STEP.SUCCEEDED:
      return "已提交，等待解析";
    case DOCUMENT_UPLOAD_STEP.FAILED:
      return item.errorMessage ?? "上传失败。";
    case DOCUMENT_UPLOAD_STEP.PENDING:
    default:
      return "等待上传";
  }
}

export function summarizeDocumentUploadItems(items: DocumentUploadItem[]) {
  if (items.length === 0) {
    return null;
  }

  const succeeded = items.filter((item) => item.step === DOCUMENT_UPLOAD_STEP.SUCCEEDED).length;
  const failed = items.filter((item) => item.step === DOCUMENT_UPLOAD_STEP.FAILED).length;

  if (failed > 0 && succeeded > 0) {
    return `已提交 ${succeeded} 个文件，${failed} 个失败。`;
  }

  if (failed > 0) {
    return `${failed} 个文件上传失败，请重试。`;
  }

  if (succeeded > 0) {
    return `已提交 ${succeeded} 个文件。`;
  }

  return null;
}
