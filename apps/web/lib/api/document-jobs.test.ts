import { describe, expect, test } from "vitest";
import { RUN_STATUS } from "@anchordesk/contracts";

import {
  canForceReparseDocumentJob,
  canRetryDocumentJob,
  describeDocumentJobFailure,
} from "./document-jobs";

describe("document job helpers", () => {
  test("marks failed jobs as retryable", () => {
    expect(canRetryDocumentJob({ status: RUN_STATUS.FAILED })).toBe(true);
    expect(canRetryDocumentJob({ status: RUN_STATUS.RUNNING })).toBe(false);
  });

  test("marks completed and failed jobs as force-reparse candidates", () => {
    expect(canForceReparseDocumentJob({ status: RUN_STATUS.COMPLETED })).toBe(true);
    expect(canForceReparseDocumentJob({ status: RUN_STATUS.FAILED })).toBe(true);
    expect(canForceReparseDocumentJob({ status: RUN_STATUS.RUNNING })).toBe(false);
    expect(canForceReparseDocumentJob({ status: RUN_STATUS.QUEUED })).toBe(false);
  });

  test("describes failure with stage, code, and message", () => {
    expect(
      describeDocumentJobFailure({
        stage: "parsing_layout",
        errorCode: "ocr_disabled",
        errorMessage: "OCR provider is disabled.",
      }),
    ).toBe("失败阶段：parsing_layout · ocr_disabled · OCR provider is disabled.");
  });
});
