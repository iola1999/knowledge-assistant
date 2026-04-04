import { describe, expect, test } from "vitest";

import {
  createDocumentUploadItems,
  DOCUMENT_UPLOAD_STEP,
  getDocumentUploadStepLabel,
  getRetryableDocumentUploadItems,
  summarizeDocumentUploadItems,
} from "./document-upload";

describe("document upload helpers", () => {
  test("returns only failed files for retry", () => {
    const [alpha, beta, gamma] = createDocumentUploadItems([
      new File(["alpha"], "alpha.pdf", { type: "application/pdf" }),
      new File(["beta"], "beta.pdf", { type: "application/pdf" }),
      new File(["gamma"], "gamma.pdf", { type: "application/pdf" }),
    ]);

    const retryable = getRetryableDocumentUploadItems([
      { ...alpha, step: DOCUMENT_UPLOAD_STEP.SUCCEEDED },
      {
        ...beta,
        step: DOCUMENT_UPLOAD_STEP.FAILED,
        errorMessage: "上传文件失败：502",
      },
      { ...gamma, step: DOCUMENT_UPLOAD_STEP.UPLOADING, progress: 42 },
    ]);

    expect(retryable.map((item) => item.id)).toEqual([beta.id]);
  });

  test("summarizes partial success after a batch finishes", () => {
    const [alpha, beta] = createDocumentUploadItems([
      new File(["alpha"], "alpha.pdf", { type: "application/pdf" }),
      new File(["beta"], "beta.pdf", { type: "application/pdf" }),
    ]);

    expect(
      summarizeDocumentUploadItems([
        { ...alpha, step: DOCUMENT_UPLOAD_STEP.SUCCEEDED },
        {
          ...beta,
          step: DOCUMENT_UPLOAD_STEP.FAILED,
          errorMessage: "上传超时，请重试。",
        },
      ]),
    ).toBe("已提交 1 个文件，1 个失败。");
  });

  test("formats per-file step text for progress and failures", () => {
    const [item] = createDocumentUploadItems([
      new File(["alpha"], "alpha.pdf", { type: "application/pdf" }),
    ]);

    expect(
      getDocumentUploadStepLabel({
        ...item,
        step: DOCUMENT_UPLOAD_STEP.UPLOADING,
        progress: 37,
      }),
    ).toBe("上传中 37%");

    expect(
      getDocumentUploadStepLabel({
        ...item,
        step: DOCUMENT_UPLOAD_STEP.FAILED,
        errorMessage: "上传超时，请重试。",
      }),
    ).toBe("上传超时，请重试。");
  });
});
