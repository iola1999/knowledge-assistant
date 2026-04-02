import Link from "next/link";
import { notFound } from "next/navigation";

import { SystemManagementSidebar } from "@/components/settings/system-management-sidebar";
import { GlobalLibraryCreateForm } from "@/components/settings/global-library-create-form";
import { SettingsShell } from "@/components/shared/settings-shell";
import { listManagedKnowledgeLibrariesWithStats } from "@/lib/api/admin-knowledge-libraries";
import {
  formatKnowledgeLibraryStatus,
} from "@/lib/api/knowledge-libraries";
import { requireSessionUser } from "@/lib/auth/require-user";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { ui } from "@/lib/ui";

export default async function GlobalLibrariesPage() {
  const user = await requireSessionUser();
  if (!isSuperAdmin(user)) {
    notFound();
  }

  const libraries = await listManagedKnowledgeLibrariesWithStats();

  return (
    <SettingsShell
      sidebar={<SystemManagementSidebar activeSection="libraries" />}
    >
      <div className="flex w-full min-w-0 flex-col gap-4">
        <GlobalLibraryCreateForm />

        <section className={ui.sectionPanel}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-0.5">
              <h2 className="text-[1.1rem] font-semibold text-app-text">现有资料库</h2>
              <p className="text-[13px] leading-6 text-app-muted-strong">
                进入详情页后可上传文件、整理目录和调整可订阅状态
              </p>
            </div>
            <span className="rounded-full border border-app-border bg-app-surface-soft px-2.5 py-0.5 text-[12px] text-app-muted">
              {libraries.length} 个资料库
            </span>
          </div>

          <div className="mt-4 grid gap-3">
            {libraries.length > 0 ? (
              libraries.map((library) => (
                <Link
                  key={library.id}
                  href={`/settings/libraries/${library.id}`}
                  className="grid gap-3 rounded-[22px] border border-app-border bg-white/86 p-4 transition hover:border-app-border-strong hover:bg-white"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="grid gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-[14px] text-app-text">{library.title}</strong>
                        <span className="rounded-full border border-app-border bg-app-surface-soft px-2.5 py-0.5 text-[11px] text-app-muted-strong">
                          {formatKnowledgeLibraryStatus(library.status)}
                        </span>
                        <code className={ui.codeChip}>{library.slug}</code>
                      </div>
                      {library.description ? (
                        <p className="text-[13px] leading-6 text-app-muted-strong">
                          {library.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="grid gap-1 text-right text-[12px] text-app-muted">
                      <span>{library.documentCount} 份资料</span>
                      <span>{library.activeSubscriptionCount} 个有效订阅</span>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-[22px] border border-app-border bg-app-surface-soft/55 p-4 text-[13px] text-app-muted-strong">
                还没有全局资料库。先创建一个，然后进入详情页上传资料。
              </div>
            )}
          </div>
        </section>
      </div>
    </SettingsShell>
  );
}
