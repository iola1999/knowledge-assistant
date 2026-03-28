import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { conversations, getDb, workspaces } from "@knowledge-assistant/db";

import { auth } from "@/auth";
import { slugify } from "@/lib/api/slug";
import {
  normalizeWorkspacePrompt,
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
    .where(eq(workspaces.userId, userId))
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

  const baseSlug = slugify(title) || "workspace";
  const db = getDb();
  let slug = baseSlug;
  let suffix = 1;

  while (true) {
    const existing = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.userId, userId), eq(workspaces.slug, slug)))
      .limit(1);

    if (!existing[0]) break;
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  const [workspace] = await db
    .insert(workspaces)
    .values({
      userId,
      slug,
      title,
      industry: industry?.trim() || null,
      workspacePrompt: normalizeWorkspacePrompt(workspacePrompt),
    })
    .returning();

  await db.insert(conversations).values({
    workspaceId: workspace.id,
    title: `${workspace.title} 默认对话`,
    mode: workspace.defaultMode,
  });

  return Response.json({ workspace }, { status: 201 });
}
