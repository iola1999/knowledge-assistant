import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class DeleteObjectCommand {
    constructor(public input: unknown) {}
  }

  class GetObjectCommand {
    constructor(public input: unknown) {}
  }

  class HeadObjectCommand {
    constructor(public input: unknown) {}
  }

  class PutObjectCommand {
    constructor(public input: unknown) {}
  }

  class S3Client {
    send = vi.fn();

    constructor(public config: unknown) {}
  }

  return {
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    PutObjectCommand,
    S3Client,
    getSignedUrl: vi.fn(),
  };
});

vi.mock("@aws-sdk/client-s3", () => ({
  DeleteObjectCommand: mocks.DeleteObjectCommand,
  GetObjectCommand: mocks.GetObjectCommand,
  HeadObjectCommand: mocks.HeadObjectCommand,
  PutObjectCommand: mocks.PutObjectCommand,
  S3Client: mocks.S3Client,
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mocks.getSignedUrl,
}));

describe("createPresignedUploadUrl", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getSignedUrl.mockReset().mockResolvedValue("https://example.test/upload");
    process.env.S3_ENDPOINT = "http://localhost:9000";
    process.env.S3_ACCESS_KEY_ID = "access-key";
    process.env.S3_SECRET_ACCESS_KEY = "secret-key";
    process.env.S3_BUCKET = "bucket-1";
    process.env.S3_FORCE_PATH_STYLE = "true";
    process.env.S3_REGION = "us-east-1";
  });

  test("uses the default 15 minute expiry when no override is provided", async () => {
    const { createPresignedUploadUrl } = await import("./index");

    await createPresignedUploadUrl({
      key: "documents/object-key",
      contentType: "application/pdf",
    });

    expect(mocks.getSignedUrl).toHaveBeenCalledWith(
      expect.any(mocks.S3Client),
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: "bucket-1",
          Key: "documents/object-key",
          ContentType: "application/pdf",
        }),
      }),
      { expiresIn: 60 * 15 },
    );
  });

  test("uses the provided expiry override when requested", async () => {
    const { createPresignedUploadUrl } = await import("./index");

    await createPresignedUploadUrl({
      key: "documents/object-key",
      contentType: "application/pdf",
      expiresInSeconds: 60 * 60,
    });

    expect(mocks.getSignedUrl).toHaveBeenCalledWith(
      expect.any(mocks.S3Client),
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: "bucket-1",
          Key: "documents/object-key",
          ContentType: "application/pdf",
        }),
      }),
      { expiresIn: 60 * 60 },
    );
  });
});
