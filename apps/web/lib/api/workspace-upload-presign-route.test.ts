import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    auth: vi.fn(),
    buildContentAddressedStorageKey: vi.fn(),
    createPresignedUploadUrl: vi.fn(),
    hasVerifiedContentAddressedBlob: vi.fn(),
    normalizeSha256Hex: vi.fn(),
    requireOwnedWorkspace: vi.fn(),
    validateUploadSupport: vi.fn(),
  };
});

vi.mock("@/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/api/content-addressed-storage", () => ({
  hasVerifiedContentAddressedBlob: mocks.hasVerifiedContentAddressedBlob,
}));

vi.mock("@/lib/api/upload-policy", () => ({
  validateUploadSupport: mocks.validateUploadSupport,
}));

vi.mock("@/lib/guards/workspace", () => ({
  requireOwnedWorkspace: mocks.requireOwnedWorkspace,
}));

vi.mock("@anchordesk/storage", () => ({
  buildContentAddressedStorageKey: mocks.buildContentAddressedStorageKey,
  createPresignedUploadUrl: mocks.createPresignedUploadUrl,
  normalizeSha256Hex: mocks.normalizeSha256Hex,
}));

let POST: typeof import("../../app/api/workspaces/[workspaceId]/uploads/presign/route").POST;

beforeAll(async () => {
  ({ POST } = await import("../../app/api/workspaces/[workspaceId]/uploads/presign/route"));
});

beforeEach(() => {
  mocks.auth.mockReset();
  mocks.buildContentAddressedStorageKey.mockReset();
  mocks.createPresignedUploadUrl.mockReset();
  mocks.hasVerifiedContentAddressedBlob.mockReset();
  mocks.normalizeSha256Hex.mockReset();
  mocks.requireOwnedWorkspace.mockReset();
  mocks.validateUploadSupport.mockReset();
});

describe("POST /api/workspaces/[workspaceId]/uploads/presign", () => {
  it("requests a longer presigned upload window for knowledge-base documents", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.requireOwnedWorkspace.mockResolvedValue({ id: "workspace-1" });
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
      new Request("http://localhost/api/workspaces/workspace-1/uploads/presign", {
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
        params: Promise.resolve({ workspaceId: "workspace-1" }),
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
