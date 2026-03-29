"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";

import { buttonStyles, cn, ui } from "@/lib/ui";

type AccountDisplayNameFormProps = {
  initialDisplayName: string;
  layout?: "standalone" | "compact";
};

export function AccountDisplayNameForm({
  initialDisplayName,
  layout = "standalone",
}: AccountDisplayNameFormProps) {
  const router = useRouter();
  const { update } = useSession();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [status, setStatus] = useState<{
    tone: "error" | "muted";
    message: string;
  } | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setIsPending(true);

    try {
      const response = await fetch("/api/account/display-name", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ displayName }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; displayName?: string }
        | null;

      if (!response.ok) {
        setStatus({
          tone: "error",
          message: body?.error ?? "更新显示名称失败。",
        });
        return;
      }

      const nextDisplayName = body?.displayName ?? displayName.trim();
      setDisplayName(nextDisplayName);
      await update({ user: { name: nextDisplayName } });
      router.refresh();
      setStatus({
        tone: "muted",
        message: "显示名称已更新。",
      });
    } finally {
      setIsPending(false);
    }
  }

  const compactInputClass =
    "h-10 rounded-[18px] px-3.5 text-[14px] focus:ring-[3px]";

  return (
    <form
      onSubmit={onSubmit}
      className={cn(layout === "standalone" ? cn(ui.panelLarge, "grid gap-5") : "grid gap-2.5")}
    >
      {layout === "standalone" ? (
        <div className="grid gap-2">
          <p className={ui.eyebrow}>Profile</p>
          <h2>显示名称</h2>
          <p className={ui.muted}>更新后会同步显示在账号页和工作区左下角</p>
        </div>
      ) : null}

      <label
        className={cn(
          ui.label,
          layout === "compact" && "gap-1 text-[13px] font-medium text-app-muted",
        )}
      >
        显示名称
        <input
          required
          maxLength={120}
          className={cn(ui.input, layout === "compact" && compactInputClass)}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </label>

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          className={cn(
            buttonStyles({ size: layout === "compact" ? "sm" : "md" }),
            layout === "compact" && "min-h-8 px-3 text-[13px]",
          )}
          disabled={isPending}
          type="submit"
        >
          {isPending ? "提交中..." : "更新显示名称"}
        </button>
        {status ? (
          <span
            className={cn(
              status.tone === "error" ? ui.error : ui.muted,
              layout === "compact" && "text-[12px] leading-5",
            )}
          >
            {status.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
