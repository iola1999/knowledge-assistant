import Link from "next/link";

import { CreateWorkspaceForm } from "@/components/workspaces/create-workspace-form";
import { buttonStyles, ui } from "@/lib/ui";

export default function NewWorkspacePage() {
  return (
    <div className="mx-auto grid min-h-screen w-full max-w-[1320px] grid-cols-1 gap-6 px-6 py-8 md:px-8 xl:grid-cols-[minmax(0,0.88fr)_minmax(360px,0.92fr)]">
      <div className="space-y-3 px-2 py-3">
        <p className={ui.eyebrow}>Create Space</p>
        <h1>创建一个新的工作空间</h1>
        <p className={ui.muted}>
          一个空间对应一组资料、历史会话和生成结果。先把主题边界定义清楚，后续助手输出会更稳定。
        </p>
        <Link href="/workspaces" className={buttonStyles({ variant: "secondary" })}>
          返回空间列表
        </Link>
      </div>
      <CreateWorkspaceForm />
    </div>
  );
}
