import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb, workspaces } from "@anchordesk/db";

import { auth } from "@/auth";
import { createWorkspace } from "@/lib/api/workspace-creation";
import { ensureWorkspaceRootDirectory } from "@/lib/api/workspace-directories";
import {
  WORKSPACE_PROMPT_MAX_LENGTH,
} from "@/lib/api/workspace-prompt";

export const runtime = "nodejs";

const createWorkspaceSchema = z.object({
  title: z.string().trim().min(1, "空间名称不能为空。").max(200, "空间名称不能超过 200 个字符。"),
  workspacePrompt: z
    .string()
    .trim()
    .max(
      WORKSPACE_PROMPT_MAX_LENGTH,
      `预置提示词不能超过 ${WORKSPACE_PROMPT_MAX_LENGTH} 个字符。`,
    )
    .optional(),
  industry: z.string().trim().max(80).optional(),
});

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const items = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.userId, userId), isNull(workspaces.archivedAt)))
    .orderBy(desc(workspaces.createdAt));

  return Response.json({ workspaces: items });
}

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createWorkspaceSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "创建空间参数无效。" },
      { status: 400 },
    );
  }
  const { title, workspacePrompt, industry } = parsed.data;

  const db = getDb();
  const workspace = await createWorkspace(
    {
      userId,
      title,
      industry,
      workspacePrompt,
    },
    {
      slugExists: async (slug) => {
        const existing = await db
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(and(eq(workspaces.userId, userId), eq(workspaces.slug, slug)))
          .limit(1);

        return Boolean(existing[0]);
      },
      insertWorkspace: async (values) => {
        const [workspace] = await db.insert(workspaces).values(values).returning();
        return workspace;
      },
    },
  );

  await ensureWorkspaceRootDirectory(workspace.id, db);

  return Response.json({ workspace }, { status: 201 });
}
