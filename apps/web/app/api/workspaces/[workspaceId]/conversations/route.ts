import { desc, eq } from "drizzle-orm";

import { conversations, getDb, resolveSelectedModelProfile } from "@anchordesk/db";

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

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    modelProfileId?: string;
  };
  const db = getDb();
  let selectedModelProfile;
  try {
    selectedModelProfile = await resolveSelectedModelProfile(
      {
        requestedModelProfileId: body.modelProfileId,
      },
      db,
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : "Invalid model profile selection",
      },
      { status: 400 },
    );
  }

  const [conversation] = await db
    .insert(conversations)
    .values({
      workspaceId,
      title: String(body.title ?? "").trim() || `${workspace.title} 对话`,
      modelProfileId: selectedModelProfile.id,
    })
    .returning();

  return Response.json({ conversation }, { status: 201 });
}

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
  const result = await db
    .select()
    .from(conversations)
    .where(eq(conversations.workspaceId, workspaceId))
    .orderBy(desc(conversations.updatedAt), desc(conversations.createdAt));

  return Response.json({ conversations: result });
}
