import { describe, expect, test } from "vitest";

import {
  buildDraftAttachmentExpiryDate,
  buildTemporaryAttachmentDirectory,
  buildTemporaryAttachmentLogicalPath,
  canSubmitWithAttachments,
  hasReadyAttachments,
  resolveComposerAttachmentStatus,
} from "./conversation-attachments";

describe("conversation attachment helpers", () => {
  test("builds scoped temporary directories for draft uploads and live conversations", () => {
    expect(
      buildTemporaryAttachmentDirectory({
        draftUploadId: "draft_1234567890",
        attachmentKey: "upload_abcdef",
      }),
    ).toBe("资料库/临时目录/草稿-draft_12/附件-upload_a");

    expect(
      buildTemporaryAttachmentDirectory({
        conversationId: "conversation-abcdef123456",
        attachmentKey: "file-001",
      }),
    ).toBe("资料库/临时目录/会话-conversa/附件-file-001");
  });

  test("builds logical paths and draft expiry timestamps", () => {
    expect(
      buildTemporaryAttachmentLogicalPath({
        directoryPath: "资料库/临时目录/草稿-a1b2",
        sourceFilename: "发布清单.md",
      }),
    ).toBe("资料库/临时目录/草稿-a1b2/发布清单.md");

    expect(
      buildDraftAttachmentExpiryDate(new Date("2026-03-29T00:00:00.000Z")).toISOString(),
    ).toBe("2026-03-30T00:00:00.000Z");
  });

  test("allows sending once every attachment is either ready or failed", () => {
    expect(canSubmitWithAttachments(["ready", "failed"])).toBe(true);
    expect(canSubmitWithAttachments(["parsing", "ready"])).toBe(false);
    expect(hasReadyAttachments(["failed", "ready"])).toBe(true);
    expect(hasReadyAttachments(["failed"])).toBe(false);
    expect(resolveComposerAttachmentStatus({ jobStatus: "completed" })).toBe("ready");
    expect(resolveComposerAttachmentStatus({ parseStage: "failed" })).toBe("failed");
    expect(resolveComposerAttachmentStatus({ jobStatus: "running" })).toBe("parsing");
  });
});
