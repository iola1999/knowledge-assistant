import type { ReactNode } from "react";

import { requireUserId } from "@/lib/auth/require-user";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireUserId();

  return <main className="page">{children}</main>;
}
