import { notFound } from "next/navigation";

import { SystemRuntimeOverviewPanel } from "@/components/settings/system-runtime-overview-panel";
import { requireSessionUser } from "@/lib/auth/require-user";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getSystemRuntimeOverview } from "@/lib/api/system-runtime-overview";

export default async function AdminRuntimePage() {
  const user = await requireSessionUser();
  if (!isSuperAdmin(user)) {
    notFound();
  }

  return <SystemRuntimeOverviewPanel overview={await getSystemRuntimeOverview()} />;
}
