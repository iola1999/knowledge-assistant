"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { buttonStyles, ui } from "@/lib/ui";

export function OutlineButton({
  reportId,
  disabled,
}: {
  reportId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleClick() {
    setStatus(null);

    const response = await fetch(`/api/reports/${reportId}/outline`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setStatus(body?.error ?? "生成大纲失败");
      return;
    }

    setStatus("大纲已更新");
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="grid gap-2">
      <button
        className={buttonStyles()}
        disabled={disabled || isPending}
        onClick={handleClick}
        type="button"
      >
        {isPending ? "刷新中..." : "生成大纲"}
      </button>
      {status ? <p className={ui.muted}>{status}</p> : null}
    </div>
  );
}
