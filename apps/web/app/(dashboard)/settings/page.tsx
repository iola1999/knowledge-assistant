import { asc } from "drizzle-orm";
import { notFound } from "next/navigation";

import { getDb, systemSettings } from "@anchordesk/db";

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
      summary: systemSettings.summary,
      description: systemSettings.description,
    })
    .from(systemSettings)
    .orderBy(asc(systemSettings.settingKey));

  const sections = buildSystemSettingSections(rows);
  return <SystemSettingsForm sections={sections} />;
}
