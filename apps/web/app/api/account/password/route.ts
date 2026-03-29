import { eq } from "drizzle-orm";

import { hashPassword } from "@anchordesk/auth";
import { getDb, users } from "@anchordesk/db";

import { auth } from "@/auth";
import { validateChangePasswordInput } from "@/lib/auth/password-change";
import { revokeUserSessions } from "@/lib/auth/session-registry";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = validateChangePasswordInput(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "修改密码参数无效。" },
      { status: 400 },
    );
  }

  const db = getDb();
  const [user] = await db
    .select({
      id: users.id,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const nextPasswordHash = await hashPassword(parsed.data.nextPassword);

  await db
    .update(users)
    .set({
      passwordHash: nextPasswordHash,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  const revokedSessionCount = await revokeUserSessions({ userId });

  return Response.json({ ok: true, revokedSessionCount });
}
