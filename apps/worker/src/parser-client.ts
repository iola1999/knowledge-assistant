export type ParseArtifact = {
  page_count: number;
  pages: Array<{ page_no: number; width?: number; height?: number; text_length?: number }>;
  blocks: Array<{
    page_no: number;
    order_index: number;
    block_type: string;
    section_label?: string | null;
    heading_path?: string[];
    text: string;
    bbox_json?: { x1: number; y1: number; x2: number; y2: number } | null;
    metadata_json?: Record<string, unknown> | null;
  }>;
  parse_score_bp: number;
  source?: {
    mode?: string | null;
    ocr_provider?: string | null;
  } | null;
};

export type ParseArtifactRequestPayload = {
  workspace_id?: string | null;
  library_id?: string | null;
  document_version_id: string;
  storage_key: string;
  sha256: string;
  title?: string | null;
  logical_path?: string | null;
};

type ParserErrorDetail = {
  code?: string;
  message?: string;
  ocr_provider?: string;
  recoverable?: boolean;
};

type RequestParseArtifactInput = {
  parserServiceUrl: string;
  payload: ParseArtifactRequestPayload;
  fetchImpl?: typeof fetch;
};

export function isOcrParserErrorCode(code: string | null | undefined) {
  return typeof code === "string" && code.startsWith("ocr_");
}

export class ParserServiceError extends Error {
  readonly code: string;
  readonly status: number;
  readonly ocrRequired: boolean;
  readonly recoverable: boolean;
  readonly ocrProvider: string | null;

  constructor(input: {
    code: string;
    message: string;
    status: number;
    ocrRequired?: boolean;
    recoverable?: boolean;
    ocrProvider?: string | null;
  }) {
    super(input.message);
    this.name = "ParserServiceError";
    this.code = input.code;
    this.status = input.status;
    this.ocrRequired = input.ocrRequired ?? false;
    this.recoverable = input.recoverable ?? false;
    this.ocrProvider = input.ocrProvider ?? null;
  }
}

function readParserErrorDetail(payload: unknown): ParserErrorDetail | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const detail =
    "detail" in payload &&
    payload.detail &&
    typeof payload.detail === "object"
      ? (payload.detail as Record<string, unknown>)
      : null;
  if (!detail || typeof detail !== "object") {
    return null;
  }

  return {
    code: typeof detail.code === "string" ? detail.code : undefined,
    message: typeof detail.message === "string" ? detail.message : undefined,
    ocr_provider:
      typeof detail.ocr_provider === "string" ? detail.ocr_provider : undefined,
    recoverable: detail.recoverable === true,
  };
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function requestParseArtifact(
  input: RequestParseArtifactInput,
): Promise<ParseArtifact> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`${input.parserServiceUrl}/parse`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input.payload),
  });

  const payload = await readJsonResponse(response);
  if (response.ok) {
    return payload as ParseArtifact;
  }

  const detail = readParserErrorDetail(payload);
  throw new ParserServiceError({
    code: detail?.code ?? `parser_http_${response.status}`,
    message: detail?.message ?? `Parser service failed with ${response.status}`,
    status: response.status,
    ocrRequired: isOcrParserErrorCode(detail?.code),
    recoverable: detail?.recoverable === true,
    ocrProvider: detail?.ocr_provider ?? null,
  });
}

export function didArtifactUseOcr(artifact: ParseArtifact | null | undefined) {
  return artifact?.source?.mode === "ocr";
}
