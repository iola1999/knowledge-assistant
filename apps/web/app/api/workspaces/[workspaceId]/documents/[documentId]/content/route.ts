import { and, eq } from "drizzle-orm";

import { documents, documentVersions, getDb } from "@anchordesk/db";
import { getObjectBytes } from "@anchordesk/storage";

import { auth } from "@/auth";
import { requireOwnedWorkspace } from "@/lib/guards/workspace";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; documentId: string }> },
) {
  const { workspaceId, documentId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspace = await requireOwnedWorkspace(workspaceId, userId);
  if (!workspace) {
    return Response.json({ error: "Workspace not found" }, { status: 404 });
  }

  const db = getDb();
  const [document] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.workspaceId, workspaceId)))
    .limit(1);

  if (!document || !document.latestVersionId) {
    return Response.json({ error: "Document not found" }, { status: 404 });
  }

  const [version] = await db
    .select({
      storageKey: documentVersions.storageKey,
    })
    .from(documentVersions)
    .where(eq(documentVersions.id, document.latestVersionId))
    .limit(1);

  if (!version) {
    return Response.json({ error: "Document version not found" }, { status: 404 });
  }

  const bytes = await getObjectBytes(version.storageKey);
  if (!bytes) {
    return Response.json({ error: "Document file not found" }, { status: 404 });
  }

  const responseBytes = Uint8Array.from(bytes);

  return new Response(responseBytes.buffer, {
    headers: {
      "content-type": document.mimeType,
      "content-length": String(bytes.byteLength),
      "cache-control": "private, max-age=60",
    },
  });
}
