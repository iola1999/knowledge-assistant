"use client";

import { signOut } from "next-auth/react";
import { useState, useTransition } from "react";

import { buttonStyles, cn, ui } from "@/lib/ui";

export function AccountPasswordForm({
  layout = "standalone",
}: {
  layout?: "standalone" | "compact";
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<{
    tone: "error" | "muted";
    message: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    const response = await fetch("/api/account/password", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        currentPassword,
        nextPassword,
        confirmPassword,
      }),
    });
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;

    if (!response.ok) {
      setStatus({
        tone: "error",
        message: body?.error ?? "修改密码失败。",
      });
      return;
    }

    setStatus({
      tone: "muted",
      message: "密码已更新，正在退出所有登录会话...",
    });
    startTransition(() => {
      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
    });
    await signOut({
      callbackUrl: "/login",
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cn(layout === "standalone" ? cn(ui.panelLarge, "grid gap-5") : "grid gap-3")}
    >
      {layout === "standalone" ? (
        <div className="grid gap-2">
          <p className={ui.eyebrow}>Security</p>
          <h2>修改密码</h2>
          <p className={ui.muted}>使用当前密码确认身份，再设置新的登录密码。更新后会撤销所有已登录会话。</p>
        </div>
      ) : null}

      <div className={cn("grid gap-4", layout === "compact" && "xl:grid-cols-3")}>
        <label className={ui.label}>
          当前密码
          <input
            required
            type="password"
            autoComplete="current-password"
            className={ui.input}
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>

        <label className={ui.label}>
          新密码
          <input
            required
            type="password"
            minLength={6}
            autoComplete="new-password"
            className={ui.input}
            value={nextPassword}
            onChange={(event) => setNextPassword(event.target.value)}
          />
        </label>

        <label className={ui.label}>
          确认新密码
          <input
            required
            type="password"
            minLength={6}
            autoComplete="new-password"
            className={ui.input}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          className={buttonStyles({ size: layout === "compact" ? "sm" : "md" })}
          disabled={isPending}
          type="submit"
        >
          {isPending ? "提交中..." : "更新密码"}
        </button>
        {status ? (
          <span className={status.tone === "error" ? ui.error : ui.muted}>{status.message}</span>
        ) : null}
      </div>
    </form>
  );
}
