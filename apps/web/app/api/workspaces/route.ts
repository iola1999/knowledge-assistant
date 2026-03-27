import { and, desc, eq } from "drizzle-orm";

import { conversations, getDb, workspaces } from "@law-doc/db";

import { auth } from "@/auth";
import { slugify } from "@/lib/api/slug";

export const runtime = "nodejs";

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

  const body = (await request.json()) as {
    title?: string;
    industry?: string;
    description?: string;
  };

  const title = String(body.title ?? "").trim();
  if (!title) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }

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
      industry: String(body.industry ?? "").trim() || null,
      description: String(body.description ?? "").trim() || null,
    })
    .returning();

  await db.insert(conversations).values({
    workspaceId: workspace.id,
    title: `${workspace.title} 默认对话`,
    mode: workspace.defaultMode,
  });

  return Response.json({ workspace }, { status: 201 });
}
