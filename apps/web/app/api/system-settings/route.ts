import { asc, eq } from "drizzle-orm";

import { getDb, systemSettings } from "@law-doc/db";

import { auth } from "@/auth";
import {
  normalizeSystemSettingUpdates,
  systemSettingsUpdateSchema,
} from "@/lib/api/system-settings";
import { isSuperAdminUsername } from "@/lib/auth/super-admin";

export const runtime = "nodejs";

async function listSystemSettings() {
  const db = getDb();
  return await db
    .select({
      settingKey: systemSettings.settingKey,
      valueText: systemSettings.valueText,
      isSecret: systemSettings.isSecret,
      description: systemSettings.description,
    })
    .from(systemSettings)
    .orderBy(asc(systemSettings.settingKey));
}

function unauthorizedResponse() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

function forbiddenResponse() {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}

export async function GET() {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) {
    return unauthorizedResponse();
  }
  if (!isSuperAdminUsername(user.username)) {
    return forbiddenResponse();
  }

  return Response.json({
    settings: await listSystemSettings(),
  });
}

export async function PATCH(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) {
    return unauthorizedResponse();
  }
  if (!isSuperAdminUsername(user.username)) {
    return forbiddenResponse();
  }

  const body = await request.json().catch(() => null);
  const parsed = systemSettingsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid system settings payload",
      },
      { status: 400 },
    );
  }

  const currentSettings = await listSystemSettings();
  if (currentSettings.length === 0) {
    return Response.json(
      {
        error:
          "System settings have not been initialized yet. Run pnpm dev once to seed defaults.",
      },
      { status: 409 },
    );
  }

  let updates;
  try {
    updates = normalizeSystemSettingUpdates(
      parsed.data.settings,
      currentSettings.map((setting) => setting.settingKey),
    );
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to validate system settings";
    return Response.json({ error: message }, { status: 400 });
  }

  const db = getDb();
  const updatedAt = new Date();

  await db.transaction(async (tx) => {
    for (const update of updates) {
      await tx
        .update(systemSettings)
        .set({
          valueText: update.valueText,
          updatedAt,
        })
        .where(eq(systemSettings.settingKey, update.settingKey));
    }
  });

  return Response.json({
    settings: await listSystemSettings(),
  });
}
