import {
  buildContentAddressedStorageKey,
  createPresignedUploadUrl,
  normalizeSha256Hex,
} from "@anchordesk/storage";

import { auth } from "@/auth";
import { hasVerifiedContentAddressedBlob } from "@/lib/api/content-addressed-storage";
import { DOCUMENT_UPLOAD_PRESIGN_EXPIRES_IN_SECONDS } from "@/lib/api/document-upload";
import { requireOwnedWorkspace } from "@/lib/guards/workspace";
import { validateUploadSupport } from "@/lib/api/upload-policy";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspace = await requireOwnedWorkspace(workspaceId, userId);
  if (!workspace) {
    return Response.json({ error: "Workspace not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    filename?: string;
    contentType?: string;
    directoryPath?: string;
    sha256?: string;
  };

  const filename = String(body.filename ?? "").trim();
  const contentType = String(body.contentType ?? "application/octet-stream");
  const directoryPath = String(body.directoryPath ?? "").trim();
  const sha256 = String(body.sha256 ?? "").trim();

  if (!filename || !sha256) {
    return Response.json({ error: "filename and sha256 are required" }, { status: 400 });
  }

  const support = validateUploadSupport({ filename, contentType });
  if (!support.ok) {
    return Response.json({ error: support.message, code: support.code }, { status: 400 });
  }

  let key: string;
  let normalizedSha256: string;
  try {
    normalizedSha256 = normalizeSha256Hex(sha256);
    key = buildContentAddressedStorageKey(normalizedSha256);
  } catch {
    return Response.json({ error: "sha256 is invalid" }, { status: 400 });
  }

  if (await hasVerifiedContentAddressedBlob(normalizedSha256)) {
    return Response.json({
      uploadUrl: null,
      key,
      bucket: null,
      alreadyExists: true,
      directoryPath,
    });
  }

  const presigned = await createPresignedUploadUrl({
    key,
    contentType,
    expiresInSeconds: DOCUMENT_UPLOAD_PRESIGN_EXPIRES_IN_SECONDS,
  });

  return Response.json({
    uploadUrl: presigned.url,
    key: presigned.key,
    bucket: presigned.bucket,
    alreadyExists: false,
    directoryPath,
  });
}
