import { eq } from "drizzle-orm";

import {
  findDefaultModelProfile,
  findModelProfileById,
  getDb,
  listModelProfiles,
  llmModelProfiles,
} from "@anchordesk/db";
import { MODEL_PROFILE_API_TYPE } from "@anchordesk/contracts";

import { auth } from "@/auth";
import { modelProfileMutationSchema } from "@/lib/api/model-profiles";
import { isSuperAdmin } from "@/lib/auth/super-admin";

export const runtime = "nodejs";

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
  if (!isSuperAdmin(user)) {
    return forbiddenResponse();
  }

  return Response.json({
    profiles: await listModelProfiles(),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) {
    return unauthorizedResponse();
  }
  if (!isSuperAdmin(user)) {
    return forbiddenResponse();
  }

  const body = await request.json().catch(() => null);
  const parsed = modelProfileMutationSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid model profile payload",
      },
      { status: 400 },
    );
  }

  const db = getDb();
  const existingDefault = await findDefaultModelProfile(db);
  const nextIsDefault = existingDefault ? parsed.data.isDefault : true;
  const nextEnabled = existingDefault ? parsed.data.enabled : true;

  if (!existingDefault && (!nextIsDefault || !nextEnabled)) {
    return Response.json(
      {
        error: "第一个模型必须同时设为默认且保持启用。",
      },
      { status: 400 },
    );
  }

  if (nextIsDefault && !nextEnabled) {
    return Response.json(
      {
        error: "默认模型必须保持启用。",
      },
      { status: 400 },
    );
  }

  const updatedAt = new Date();
  let createdProfileId = "";

  await db.transaction(async (tx) => {
    if (nextIsDefault) {
      await tx
        .update(llmModelProfiles)
        .set({
          isDefault: false,
          updatedAt,
        })
        .where(eq(llmModelProfiles.isDefault, true));
    }

    const [createdProfile] = await tx
      .insert(llmModelProfiles)
      .values({
        apiType: MODEL_PROFILE_API_TYPE.ANTHROPIC,
        displayName: parsed.data.displayName,
        modelName: parsed.data.modelName,
        baseUrl: parsed.data.baseUrl,
        apiKey: parsed.data.apiKey,
        enabled: nextEnabled,
        isDefault: nextIsDefault,
        updatedAt,
      })
      .returning({
        id: llmModelProfiles.id,
      });

    createdProfileId = createdProfile?.id ?? "";
  });

  const profile = createdProfileId
    ? await findModelProfileById(createdProfileId, db)
    : null;

  return Response.json(
    {
      profile,
      profileId: createdProfileId || null,
      profiles: await listModelProfiles(db),
    },
    { status: 201 },
  );
}
