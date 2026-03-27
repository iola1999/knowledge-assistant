import Link from "next/link";
import { eq } from "drizzle-orm";

import { getDb, users, workspaces } from "@law-doc/db";

import { auth } from "@/auth";

export default async function WorkspacesPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const db = getDb();

  const workspaceList = userId
    ? await db.select().from(workspaces).where(eq(workspaces.userId, userId))
    : [];
  const userRecord = userId
    ? await db.select().from(users).where(eq(users.id, userId)).limit(1)
    : [];

  return (
    <div className="stack">
      <div className="toolbar">
        <div>
          <h1>工作空间</h1>
          <p className="muted">
            欢迎，{session?.user?.name ?? userRecord[0]?.displayName ?? "用户"}
          </p>
        </div>
        <Link href="/workspaces/new" className="card">
          新建工作空间
        </Link>
      </div>

      <div className="grid">
        {workspaceList.length ? (
          workspaceList.map((workspace) => (
            <Link key={workspace.id} href={`/workspaces/${workspace.id}`} className="card">
              <strong>{workspace.title}</strong>
              <p className="muted">{workspace.description || "暂无描述"}</p>
            </Link>
          ))
        ) : (
          <div className="card">
            <p>还没有工作空间。</p>
          </div>
        )}
      </div>
    </div>
  );
}
