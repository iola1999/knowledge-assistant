import Link from "next/link";

import { CreateWorkspaceForm } from "@/components/workspaces/create-workspace-form";
import { buttonStyles, cn, ui } from "@/lib/ui";

export default function NewWorkspacePage() {
  return (
    <div className={cn(ui.pageNarrow, "min-h-screen max-w-[920px] gap-5 py-10")}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-[64ch] space-y-2">
          <p className={ui.eyebrow}>Create Space</p>
          <h1>新建工作空间</h1>
          <p className={ui.muted}>
            每个空间对应一组资料、会话和生成结果。名称用于划定边界，预置提示词用于统一约束后续回答方式。
          </p>
        </div>
        <Link
          href="/workspaces"
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          返回空间列表
        </Link>
      </div>
      <CreateWorkspaceForm />
    </div>
  );
}
