import { eq } from "drizzle-orm";

import { getDb, systemSettings } from "@knowledge-assistant/db";

import {
  AUTH_ALLOW_REGISTRATION_SETTING_KEY,
  parseSystemSettingBoolean,
} from "@/lib/api/system-settings";

export async function readRegistrationEnabled() {
  const db = getDb();
  const rows = await db
    .select({
      valueText: systemSettings.valueText,
    })
    .from(systemSettings)
    .where(eq(systemSettings.settingKey, AUTH_ALLOW_REGISTRATION_SETTING_KEY))
    .limit(1);

  return parseSystemSettingBoolean(rows[0]?.valueText, true);
}
