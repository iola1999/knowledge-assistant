import { and, eq } from "drizzle-orm";

import { getDb, workspaces } from "@law-doc/db";

import { auth } from "@/auth";

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

  const db = getDb();
  const result = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)))
    .limit(1);

  if (!result[0]) {
    return Response.json({ error: "Workspace not found" }, { status: 404 });
  }

  return Response.json({ workspace: result[0] });
}
