"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

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
    <div className="stack">
      <button disabled={disabled || isPending} onClick={handleClick} type="button">
        {isPending ? "刷新中..." : "生成大纲"}
      </button>
      {status ? <p className="muted">{status}</p> : null}
    </div>
  );
}
