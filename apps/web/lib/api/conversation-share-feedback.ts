export const SHARE_NOTICE_AUTO_DISMISS_MS = 1600;

export type ShareNotice = {
  tone: "success" | "error";
  message: string;
  autoDismiss: boolean;
};

export function buildEnableShareNotice(input: {
  shareUrl: string | null;
  copySucceeded: boolean;
}): ShareNotice {
  if (!input.shareUrl) {
    return {
      tone: "success",
      message: "公开分享已开启",
      autoDismiss: true,
    };
  }

  if (input.copySucceeded) {
    return {
      tone: "success",
      message: "链接已复制",
      autoDismiss: true,
    };
  }

  return {
    tone: "error",
    message: "已创建分享链接，请手动复制",
    autoDismiss: false,
  };
}

export function buildCopyShareNotice(copySucceeded: boolean): ShareNotice {
  if (copySucceeded) {
    return {
      tone: "success",
      message: "分享链接已复制",
      autoDismiss: true,
    };
  }

  return {
    tone: "error",
    message: "复制链接失败",
    autoDismiss: false,
  };
}
