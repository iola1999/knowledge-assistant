import { desc, eq } from "drizzle-orm";
import { REPORT_STATUS } from "@anchordesk/contracts";

import { getDb, reports } from "@anchordesk/db";

import { auth } from "@/auth";
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
  const items = await db
    .select()
    .from(reports)
    .where(eq(reports.workspaceId, workspaceId))
    .orderBy(desc(reports.createdAt));

  return Response.json({ reports: items });
}

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

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    conversationId?: string;
  };

  const title = String(body.title ?? "").trim() || `${workspace.title} 报告`;
  const db = getDb();
  const [report] = await db
    .insert(reports)
    .values({
      workspaceId,
      conversationId: body.conversationId ? String(body.conversationId) : null,
      title,
      status: REPORT_STATUS.DRAFT,
    })
    .returning();

  return Response.json({ report }, { status: 201 });
}
