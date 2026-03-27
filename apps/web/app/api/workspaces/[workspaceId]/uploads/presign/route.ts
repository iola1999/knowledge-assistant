import { createPresignedUploadUrl } from "@law-doc/storage";

import { auth } from "@/auth";
import { requireOwnedWorkspace } from "@/lib/guards/workspace";

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
  };

  const filename = String(body.filename ?? "").trim();
  const contentType = String(body.contentType ?? "application/octet-stream");
  const directoryPath = String(body.directoryPath ?? "").trim();

  if (!filename) {
    return Response.json({ error: "filename is required" }, { status: 400 });
  }

  const safeFilename = filename.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
  const key = `workspaces/${workspaceId}/${Date.now()}-${safeFilename}`;
  const presigned = await createPresignedUploadUrl({ key, contentType });

  return Response.json({
    uploadUrl: presigned.url,
    key: presigned.key,
    bucket: presigned.bucket,
    directoryPath,
  });
}
