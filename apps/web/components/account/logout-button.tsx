"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

import { buttonStyles, ui } from "@/lib/ui";

export function LogoutButton() {
  const [isPending, setIsPending] = useState(false);

  async function onClick() {
    setIsPending(true);
    await signOut({
      callbackUrl: "/login",
    });
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        className={buttonStyles({ variant: "secondary" })}
        disabled={isPending}
        onClick={onClick}
      >
        {isPending ? "退出中..." : "退出登录"}
      </button>
      <p className={ui.muted}>退出后会跳转回登录页</p>
    </div>
  );
}
