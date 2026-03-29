import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb, workspaces } from "@anchordesk/db";

import { auth } from "@/auth";
import {
  normalizeWorkspacePrompt,
  WORKSPACE_PROMPT_MAX_LENGTH,
} from "@/lib/api/workspace-prompt";
import { resolveWorkspaceDeletedAt } from "@/lib/api/workspace-lifecycle";

export const runtime = "nodejs";

const workspacePatchSchema = z
  .object({
    title: z.string().trim().min(1, "空间名称不能为空。").max(200).optional(),
    workspacePrompt: z
      .string()
      .trim()
      .max(
        WORKSPACE_PROMPT_MAX_LENGTH,
        `预置提示词不能超过 ${WORKSPACE_PROMPT_MAX_LENGTH} 个字符。`,
      )
      .optional(),
    industry: z.string().trim().max(80).optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.workspacePrompt !== undefined ||
      value.industry !== undefined,
    {
      message: "至少提供一个需要更新的字段。",
    },
  );

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
    .where(
      and(
        eq(workspaces.id, workspaceId),
        eq(workspaces.userId, userId),
        isNull(workspaces.archivedAt),
      ),
    )
    .limit(1);

  if (!result[0]) {
    return Response.json({ error: "Workspace not found" }, { status: 404 });
  }

  return Response.json({ workspace: result[0] });
}

export async function PATCH(
  request: Request,
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
    .where(
      and(
        eq(workspaces.id, workspaceId),
        eq(workspaces.userId, userId),
        isNull(workspaces.archivedAt),
      ),
    )
    .limit(1);

  const workspace = result[0];
  if (!workspace) {
    return Response.json({ error: "Workspace not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = workspacePatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid workspace patch" },
      { status: 400 },
    );
  }

  const nextData = parsed.data;
  const [updatedWorkspace] = await db
    .update(workspaces)
    .set({
      title: nextData.title ?? workspace.title,
      workspacePrompt:
        nextData.workspacePrompt !== undefined
          ? normalizeWorkspacePrompt(nextData.workspacePrompt)
          : workspace.workspacePrompt,
      industry: nextData.industry ?? workspace.industry,
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, workspaceId))
    .returning();

  return Response.json({ workspace: updatedWorkspace });
}

export async function DELETE(
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
  const [workspace] = await db
    .select({
      id: workspaces.id,
      archivedAt: workspaces.archivedAt,
    })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.id, workspaceId),
        eq(workspaces.userId, userId),
        isNull(workspaces.archivedAt),
      ),
    )
    .limit(1);

  if (!workspace) {
    return Response.json({ error: "Workspace not found" }, { status: 404 });
  }

  await db
    .update(workspaces)
    .set({
      archivedAt: resolveWorkspaceDeletedAt({
        currentDeletedAt: workspace.archivedAt,
      }),
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, workspaceId));

  return Response.json({ ok: true });
}
