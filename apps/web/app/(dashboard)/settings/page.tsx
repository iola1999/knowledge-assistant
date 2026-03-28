import { asc } from "drizzle-orm";
import { notFound } from "next/navigation";

import { getDb, systemSettings } from "@law-doc/db";

import { SystemSettingsForm } from "@/components/settings/system-settings-form";
import { buildSystemSettingSections } from "@/lib/api/system-settings";
import { requireSessionUser } from "@/lib/auth/require-user";
import { isSuperAdminUsername } from "@/lib/auth/super-admin";

export default async function SettingsPage() {
  const user = await requireSessionUser();
  if (!isSuperAdminUsername(user.username)) {
    notFound();
  }

  const db = getDb();
  const rows = await db
    .select({
      settingKey: systemSettings.settingKey,
      valueText: systemSettings.valueText,
      isSecret: systemSettings.isSecret,
      description: systemSettings.description,
    })
    .from(systemSettings)
    .orderBy(asc(systemSettings.settingKey));

  const sections = buildSystemSettingSections(rows);

  return (
    <div className="stack">
      <section className="card stack">
        <div>
          <h1>系统设置</h1>
          <p className="muted">
            当前页面用于维护大部分 provider / infra 参数。保存后需要重启开发进程，避免
            `worker`、`agent-runtime`、`parser` 和 `web` 使用到不一致的启动配置。
          </p>
        </div>
        <p className="muted">
          `DATABASE_URL`、`AUTH_SECRET` 以及其他 Auth.js 底层开关仍只读环境变量，不在这里配置。
        </p>
        <p className="muted">
          当前页面只有 `SUPER_ADMIN_USERNAMES` 中声明的注册用户名可访问。
        </p>
      </section>

      {sections.length > 0 ? (
        <SystemSettingsForm sections={sections} />
      ) : (
        <section className="card stack">
          <h2>系统参数尚未初始化</h2>
          <p className="muted">
            先运行一次 `pnpm dev`，让建表和默认系统参数补齐流程跑完，再回来编辑这里。
          </p>
        </section>
      )}
    </div>
  );
}
