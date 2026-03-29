import { eq } from "drizzle-orm";

import { getDb, users } from "@anchordesk/db";

import { auth } from "@/auth";
import { validateDisplayNameInput } from "@/lib/auth/display-name";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = validateDisplayNameInput(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "显示名称参数无效。" },
      { status: 400 },
    );
  }

  const db = getDb();
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  await db
    .update(users)
    .set({
      displayName: parsed.data.displayName,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return Response.json({ ok: true, displayName: parsed.data.displayName });
}
