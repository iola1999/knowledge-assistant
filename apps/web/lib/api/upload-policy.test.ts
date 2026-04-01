import { describe, expect, test } from "vitest";

import {
  collectUnsupportedUploads,
  IMAGE_UPLOAD_DISABLED_MESSAGE,
  SUPPORTED_UPLOAD_ACCEPT,
  UNSUPPORTED_UPLOAD_MESSAGE,
  validateUploadSupport,
} from "./upload-policy";

describe("validateUploadSupport", () => {
  test("accepts supported document types by extension", () => {
    expect(
      validateUploadSupport({
        filename: "发布说明.PDF",
        contentType: "",
      }),
    ).toEqual({
      ok: true,
      normalizedContentType: null,
    });
  });

  test("accepts markdown files even when browsers send text/plain", () => {
    expect(
      validateUploadSupport({
        filename: "notes.md",
        contentType: "text/plain; charset=utf-8",
      }),
    ).toEqual({
      ok: true,
      normalizedContentType: "text/plain",
    });
  });

  test("rejects image uploads while OCR stays disabled", () => {
    expect(
      validateUploadSupport({
        filename: "scan.png",
        contentType: "image/png",
      }),
    ).toEqual({
      ok: false,
      code: "image_requires_ocr",
      message: IMAGE_UPLOAD_DISABLED_MESSAGE,
    });
  });

  test("tells users to upload scanned files as PDFs instead of raw images", () => {
    expect(IMAGE_UPLOAD_DISABLED_MESSAGE).toContain("扫描件，请导出为 PDF");
    expect(IMAGE_UPLOAD_DISABLED_MESSAGE).toContain("无原生文本且含图的 PDF 页");
  });

  test("rejects unsupported binary files", () => {
    expect(
      validateUploadSupport({
        filename: "archive.zip",
        contentType: "application/zip",
      }),
    ).toEqual({
      ok: false,
      code: "unsupported_type",
      message: UNSUPPORTED_UPLOAD_MESSAGE,
    });
  });
});

describe("SUPPORTED_UPLOAD_ACCEPT", () => {
  test("includes the currently supported upload formats", () => {
    expect(SUPPORTED_UPLOAD_ACCEPT).toContain(".pdf");
    expect(SUPPORTED_UPLOAD_ACCEPT).toContain(".docx");
    expect(SUPPORTED_UPLOAD_ACCEPT).toContain(".txt");
    expect(SUPPORTED_UPLOAD_ACCEPT).toContain(".md");
  });
});

describe("collectUnsupportedUploads", () => {
  test("returns only unsupported files from a mixed selection", () => {
    expect(
      collectUnsupportedUploads([
        {
          filename: "notes.md",
          contentType: "text/markdown",
        },
        {
          filename: "scan.png",
          contentType: "image/png",
        },
        {
          filename: "archive.zip",
          contentType: "application/zip",
        },
      ]),
    ).toEqual([
      {
        input: {
          filename: "scan.png",
          contentType: "image/png",
        },
        code: "image_requires_ocr",
        message: IMAGE_UPLOAD_DISABLED_MESSAGE,
      },
      {
        input: {
          filename: "archive.zip",
          contentType: "application/zip",
        },
        code: "unsupported_type",
        message: UNSUPPORTED_UPLOAD_MESSAGE,
      },
    ]);
  });
});
