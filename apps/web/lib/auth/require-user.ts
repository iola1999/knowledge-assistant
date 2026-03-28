import { redirect } from "next/navigation";

import { auth } from "@/auth";

export async function requireUserId() {
  const user = await requireSessionUser();
  return user.id;
}

export async function requireSessionUser() {
  const session = await auth();
  const user = session?.user;

  if (!user?.id) {
    redirect("/login");
  }

  return user;
}
