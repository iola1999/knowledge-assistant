import { describe, expect, it } from "vitest";

import {
  ParserServiceError,
  didArtifactUseOcr,
  isOcrParserErrorCode,
  requestParseArtifact,
} from "./parser-client";

describe("requestParseArtifact", () => {
  it("returns the parse artifact for successful parser responses", async () => {
    const artifact = await requestParseArtifact({
      parserServiceUrl: "http://localhost:8001",
      payload: {
        workspace_id: "ws_123",
        library_id: "lib_123",
        document_version_id: "dv_123",
        storage_key: "blobs/abc",
        sha256: "abc",
        title: "扫描件",
        logical_path: "资料库/扫描件.pdf",
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            page_count: 1,
            pages: [{ page_no: 1, width: 612, height: 792, text_length: 12 }],
            blocks: [],
            parse_score_bp: 3200,
            source: {
              mode: "native",
              ocr_provider: null,
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
    });

    expect(artifact.page_count).toBe(1);
    expect(didArtifactUseOcr(artifact)).toBe(false);
  });

  it("surfaces structured parser errors with code and OCR metadata", async () => {
    let thrown: unknown;

    try {
      await requestParseArtifact({
        parserServiceUrl: "http://localhost:8001",
        payload: {
          workspace_id: "ws_123",
          library_id: "lib_123",
          document_version_id: "dv_123",
          storage_key: "blobs/abc",
          sha256: "abc",
          title: "扫描件",
          logical_path: "资料库/扫描件.pdf",
        },
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              detail: {
                code: "ocr_required",
                message: "No extractable PDF text found and OCR provider is disabled.",
                ocr_provider: "disabled",
                recoverable: true,
              },
            }),
            {
              status: 422,
              headers: {
                "content-type": "application/json",
              },
            },
          ),
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ParserServiceError);
    expect(thrown).toMatchObject({
      code: "ocr_required",
      message: "No extractable PDF text found and OCR provider is disabled.",
      ocrRequired: true,
      recoverable: true,
      status: 422,
    });
  });

  it("falls back to a generic parser message when the response body is not structured", async () => {
    await expect(
      requestParseArtifact({
        parserServiceUrl: "http://localhost:8001",
        payload: {
          workspace_id: "ws_123",
          library_id: "lib_123",
          document_version_id: "dv_123",
          storage_key: "blobs/abc",
          sha256: "abc",
          title: "扫描件",
          logical_path: "资料库/扫描件.pdf",
        },
        fetchImpl: async () =>
          new Response("upstream parser timeout", {
            status: 504,
            headers: {
              "content-type": "text/plain",
            },
          }),
      }),
    ).rejects.toMatchObject({
      message: "Parser service failed with 504",
      code: "parser_http_504",
      ocrRequired: false,
      status: 504,
    });
  });

  it("marks configured OCR failures as OCR-required parser errors", async () => {
    await expect(
      requestParseArtifact({
        parserServiceUrl: "http://localhost:8001",
        payload: {
          workspace_id: "ws_123",
          library_id: "lib_123",
          document_version_id: "dv_123",
          storage_key: "blobs/abc",
          sha256: "abc",
          title: "扫描件",
          logical_path: "资料库/扫描件.pdf",
        },
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              detail: {
                code: "ocr_provider_not_configured",
                message:
                  "DashScope OCR provider is not configured. Set PARSER_OCR_DASHSCOPE_API_KEY or DASHSCOPE_API_KEY.",
                ocr_provider: "dashscope",
                recoverable: true,
              },
            }),
            {
              status: 422,
              headers: {
                "content-type": "application/json",
              },
            },
          ),
      }),
    ).rejects.toMatchObject({
      code: "ocr_provider_not_configured",
      ocrRequired: true,
      recoverable: true,
      status: 422,
    });
  });
});

describe("didArtifactUseOcr", () => {
  it("detects OCR-produced parse artifacts", () => {
    expect(
      didArtifactUseOcr({
        page_count: 1,
        pages: [],
        blocks: [],
        parse_score_bp: 2800,
        source: {
          mode: "ocr",
          ocr_provider: "dashscope",
        },
      }),
    ).toBe(true);
  });
});

describe("isOcrParserErrorCode", () => {
  it("treats all ocr_* parser codes as OCR-related", () => {
    expect(isOcrParserErrorCode("ocr_required")).toBe(true);
    expect(isOcrParserErrorCode("ocr_provider_not_configured")).toBe(true);
    expect(isOcrParserErrorCode("parser_http_422")).toBe(false);
    expect(isOcrParserErrorCode(null)).toBe(false);
  });
});
