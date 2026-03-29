import { describe, expect, test } from "vitest";

import {
  buildCopyShareNotice,
  buildEnableShareNotice,
  SHARE_NOTICE_AUTO_DISMISS_MS,
} from "./conversation-share-feedback";

describe("conversation share feedback helpers", () => {
  test("returns a short-lived copied notice after enabling and auto-copying a share link", () => {
    expect(
      buildEnableShareNotice({
        shareUrl: "https://example.com/share/token-123",
        copySucceeded: true,
      }),
    ).toEqual({
      tone: "success",
      message: "链接已复制",
      autoDismiss: true,
    });
    expect(SHARE_NOTICE_AUTO_DISMISS_MS).toBe(1600);
  });

  test("keeps a manual-copy hint when share creation succeeds but clipboard write fails", () => {
    expect(
      buildEnableShareNotice({
        shareUrl: "https://example.com/share/token-123",
        copySucceeded: false,
      }),
    ).toEqual({
      tone: "error",
      message: "已创建分享链接，请手动复制",
      autoDismiss: false,
    });
  });

  test("falls back to a generic success notice when the created share has no url", () => {
    expect(
      buildEnableShareNotice({
        shareUrl: null,
        copySucceeded: false,
      }),
    ).toEqual({
      tone: "success",
      message: "公开分享已开启",
      autoDismiss: true,
    });
  });

  test("returns light copy feedback for manual link copy actions", () => {
    expect(buildCopyShareNotice(true)).toEqual({
      tone: "success",
      message: "分享链接已复制",
      autoDismiss: true,
    });

    expect(buildCopyShareNotice(false)).toEqual({
      tone: "error",
      message: "复制链接失败",
      autoDismiss: false,
    });
  });
});
