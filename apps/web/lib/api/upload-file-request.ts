function clampUploadProgress(progress: number) {
  return Math.min(100, Math.max(0, Math.round(progress)));
}

export async function uploadFileWithProgress(input: {
  url: string;
  file: Blob;
  contentType: string;
  timeoutMs?: number;
  onProgress?: (progress: number) => void;
}) {
  if (typeof XMLHttpRequest === "undefined") {
    throw new Error("当前浏览器不支持上传进度。");
  }

  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    let settled = false;

    const fail = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      reject(error);
    };

    const succeed = () => {
      if (settled) {
        return;
      }

      settled = true;
      resolve();
    };

    request.open("PUT", input.url);
    request.timeout = input.timeoutMs ?? 0;
    request.setRequestHeader("content-type", input.contentType);

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) {
        return;
      }

      input.onProgress?.(clampUploadProgress((event.loaded / event.total) * 100));
    };

    request.onerror = () => {
      fail(new Error("上传文件失败，请重试。"));
    };

    request.ontimeout = () => {
      fail(new Error("上传超时，请重试。"));
    };

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        succeed();
        return;
      }

      fail(new Error(`上传文件失败：${request.status}`));
    };

    request.send(input.file);
  });
}

export { clampUploadProgress };
