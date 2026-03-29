"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

import { buttonStyles, cn, ui } from "@/lib/ui";

export function LogoutButton({
  layout = "standalone",
}: {
  layout?: "standalone" | "compact";
}) {
  const [isPending, setIsPending] = useState(false);

  async function onClick() {
    setIsPending(true);
    await signOut({
      callbackUrl: "/login",
    });
  }

  return (
    <div className={cn("grid gap-2", layout === "compact" && "justify-items-start")}>
      <button
        type="button"
        className={cn(
          buttonStyles({
            variant: layout === "compact" ? "ghost" : "secondary",
            size: layout === "compact" ? "sm" : "md",
          }),
          layout === "compact" && "min-h-8 px-3 text-[13px]",
        )}
        disabled={isPending}
        onClick={onClick}
      >
        {isPending ? "退出中..." : "退出登录"}
      </button>
      {layout === "standalone" ? <p className={ui.muted}>退出后会跳转回登录页</p> : null}
    </div>
  );
}
