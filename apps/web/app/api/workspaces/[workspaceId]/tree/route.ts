import { and, eq } from "drizzle-orm";

import { documents, getDb } from "@anchordesk/db";

import { auth } from "@/auth";
import { buildDocumentTree } from "@/lib/api/tree";
import { requireOwnedWorkspace } from "@/lib/guards/workspace";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
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

  const db = getDb();
  const docs = await db
    .select({ path: documents.logicalPath })
    .from(documents)
    .where(eq(documents.workspaceId, workspaceId));

  return Response.json({
    tree: buildDocumentTree(docs.map((item) => item.path)),
  });
}
