import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    auth: vi.fn(),
    buildContentAddressedStorageKey: vi.fn(),
    createPresignedUploadUrl: vi.fn(),
    findManagedKnowledgeLibrary: vi.fn(),
    hasVerifiedContentAddressedBlob: vi.fn(),
    isSuperAdmin: vi.fn(),
    normalizeSha256Hex: vi.fn(),
    validateUploadSupport: vi.fn(),
  };
});

vi.mock("@/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/api/admin-knowledge-libraries", () => ({
  findManagedKnowledgeLibrary: mocks.findManagedKnowledgeLibrary,
}));

vi.mock("@/lib/api/content-addressed-storage", () => ({
  hasVerifiedContentAddressedBlob: mocks.hasVerifiedContentAddressedBlob,
}));

vi.mock("@/lib/api/upload-policy", () => ({
  validateUploadSupport: mocks.validateUploadSupport,
}));

vi.mock("@/lib/auth/super-admin", () => ({
  isSuperAdmin: mocks.isSuperAdmin,
}));

vi.mock("@anchordesk/storage", () => ({
  buildContentAddressedStorageKey: mocks.buildContentAddressedStorageKey,
  createPresignedUploadUrl: mocks.createPresignedUploadUrl,
  normalizeSha256Hex: mocks.normalizeSha256Hex,
}));

let POST: typeof import("../../app/api/knowledge-libraries/[libraryId]/uploads/presign/route").POST;

beforeAll(async () => {
  ({ POST } = await import("../../app/api/knowledge-libraries/[libraryId]/uploads/presign/route"));
});

beforeEach(() => {
  mocks.auth.mockReset();
  mocks.buildContentAddressedStorageKey.mockReset();
  mocks.createPresignedUploadUrl.mockReset();
  mocks.findManagedKnowledgeLibrary.mockReset();
  mocks.hasVerifiedContentAddressedBlob.mockReset();
  mocks.isSuperAdmin.mockReset();
  mocks.normalizeSha256Hex.mockReset();
  mocks.validateUploadSupport.mockReset();
});

describe("POST /api/knowledge-libraries/[libraryId]/uploads/presign", () => {
  it("requests a longer presigned upload window for managed library documents", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "admin-1", isSuperAdmin: true } });
    mocks.isSuperAdmin.mockReturnValue(true);
    mocks.findManagedKnowledgeLibrary.mockResolvedValue({ id: "library-1" });
    mocks.validateUploadSupport.mockReturnValue({ ok: true });
    mocks.normalizeSha256Hex.mockReturnValue("a".repeat(64));
    mocks.buildContentAddressedStorageKey.mockReturnValue("documents/object-key");
    mocks.hasVerifiedContentAddressedBlob.mockResolvedValue(false);
    mocks.createPresignedUploadUrl.mockResolvedValue({
      url: "https://example.test/upload",
      key: "documents/object-key",
      bucket: "bucket-1",
    });

    const response = await POST(
      new Request("http://localhost/api/knowledge-libraries/library-1/uploads/presign", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          filename: "spec.pdf",
          contentType: "application/pdf",
          directoryPath: "资料库",
          sha256: "a".repeat(64),
        }),
      }),
      {
        params: Promise.resolve({ libraryId: "library-1" }),
      },
    );

    expect(response.status).toBe(200);
    expect(mocks.createPresignedUploadUrl).toHaveBeenCalledWith({
      key: "documents/object-key",
      contentType: "application/pdf",
      expiresInSeconds: 60 * 60,
    });
  });
});
