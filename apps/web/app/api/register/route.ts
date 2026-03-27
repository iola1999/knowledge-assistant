import { eq } from "drizzle-orm";

import { hashPassword } from "@law-doc/auth";
import { getDb, users } from "@law-doc/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    username?: string;
    password?: string;
    displayName?: string;
  };

  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  const displayName = String(body.displayName ?? "").trim();

  if (username.length < 3 || password.length < 6) {
    return Response.json(
      { error: "Username must be at least 3 chars and password at least 6 chars." },
      { status: 400 },
    );
  }

  const db = getDb();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (existing[0]) {
    return Response.json({ error: "Username already exists." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({
      username,
      passwordHash,
      displayName: displayName || username,
    })
    .returning({
      id: users.id,
      username: users.username,
    });

  return Response.json({ user }, { status: 201 });
}
