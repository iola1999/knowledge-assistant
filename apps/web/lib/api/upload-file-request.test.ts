import { afterEach, describe, expect, test, vi } from "vitest";

import { uploadFileWithProgress } from "./upload-file-request";

type MockUploadTarget = {
  onprogress:
    | ((event: { lengthComputable: boolean; loaded: number; total: number }) => void)
    | null;
};

describe("uploadFileWithProgress", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("reports upload progress for a successful request", async () => {
    const progressValues: number[] = [];

    class MockXMLHttpRequest {
      static instances: MockXMLHttpRequest[] = [];

      method: string | null = null;
      url: string | null = null;
      timeout = 0;
      status = 200;
      headers = new Map<string, string>();
      upload: MockUploadTarget = { onprogress: null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;

      constructor() {
        MockXMLHttpRequest.instances.push(this);
      }

      open(method: string, url: string) {
        this.method = method;
        this.url = url;
      }

      setRequestHeader(name: string, value: string) {
        this.headers.set(name, value);
      }

      send() {
        this.upload.onprogress?.({
          lengthComputable: true,
          loaded: 25,
          total: 100,
        });
        this.upload.onprogress?.({
          lengthComputable: true,
          loaded: 100,
          total: 100,
        });
        this.onload?.();
      }
    }

    vi.stubGlobal("XMLHttpRequest", MockXMLHttpRequest);

    await uploadFileWithProgress({
      url: "https://example.test/upload",
      file: new Blob(["hello world"]),
      contentType: "text/plain",
      timeoutMs: 12_345,
      onProgress(progress) {
        progressValues.push(progress);
      },
    });

    expect(progressValues).toEqual([25, 100]);
    expect(MockXMLHttpRequest.instances).toHaveLength(1);
    expect(MockXMLHttpRequest.instances[0]?.method).toBe("PUT");
    expect(MockXMLHttpRequest.instances[0]?.url).toBe("https://example.test/upload");
    expect(MockXMLHttpRequest.instances[0]?.timeout).toBe(12_345);
    expect(MockXMLHttpRequest.instances[0]?.headers.get("content-type")).toBe("text/plain");
  });

  test("rejects with a retryable timeout message when the request times out", async () => {
    class MockXMLHttpRequest {
      timeout = 0;
      status = 0;
      upload: MockUploadTarget = { onprogress: null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;

      open() {}

      setRequestHeader() {}

      send() {
        this.ontimeout?.();
      }
    }

    vi.stubGlobal("XMLHttpRequest", MockXMLHttpRequest);

    await expect(
      uploadFileWithProgress({
        url: "https://example.test/upload",
        file: new Blob(["hello world"]),
        contentType: "text/plain",
        timeoutMs: 45_000,
      }),
    ).rejects.toThrow("上传超时，请重试。");
  });
});
