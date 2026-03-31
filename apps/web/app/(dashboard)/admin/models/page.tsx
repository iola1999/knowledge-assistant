import { notFound } from "next/navigation";

import { listModelProfiles } from "@anchordesk/db";

import { ModelProfilesAdmin } from "@/components/settings/model-profiles-admin";
import { requireSessionUser } from "@/lib/auth/require-user";
import { isSuperAdmin } from "@/lib/auth/super-admin";

export default async function AdminModelsPage() {
  const user = await requireSessionUser();
  if (!isSuperAdmin(user)) {
    notFound();
  }

  return <ModelProfilesAdmin profiles={await listModelProfiles()} />;
}
