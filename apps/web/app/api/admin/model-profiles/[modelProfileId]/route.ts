import { eq } from "drizzle-orm";

import {
  findDefaultModelProfile,
  findModelProfileById,
  getDb,
  listModelProfiles,
  llmModelProfiles,
} from "@anchordesk/db";

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ modelProfileId: string }> },
) {
  const { modelProfileId } = await params;
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
  const currentProfile = await findModelProfileById(modelProfileId, db);
  if (!currentProfile) {
    return Response.json({ error: "Model profile not found" }, { status: 404 });
  }

  const currentDefaultProfile = await findDefaultModelProfile(db);
  const nextIsDefault = parsed.data.isDefault;
  const nextEnabled = parsed.data.enabled;

  if (nextIsDefault && !nextEnabled) {
    return Response.json(
      {
        error: "默认模型必须保持启用。",
      },
      { status: 400 },
    );
  }

  if (
    currentProfile.isDefault &&
    (!nextIsDefault || !nextEnabled) &&
    currentDefaultProfile?.id === currentProfile.id
  ) {
    return Response.json(
      {
        error: "请先把其他模型设为默认模型，再停用当前默认模型。",
      },
      { status: 400 },
    );
  }

  const updatedAt = new Date();

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

    await tx
      .update(llmModelProfiles)
      .set({
        displayName: parsed.data.displayName,
        modelName: parsed.data.modelName,
        baseUrl: parsed.data.baseUrl,
        apiKey: parsed.data.apiKey,
        enabled: nextEnabled,
        isDefault: nextIsDefault,
        updatedAt,
      })
      .where(eq(llmModelProfiles.id, modelProfileId));
  });

  return Response.json({
    profile: await findModelProfileById(modelProfileId, db),
    profileId: modelProfileId,
    profiles: await listModelProfiles(db),
  });
}
