"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function GenerateSectionButton({
  reportId,
  sectionId,
  sectionTitle,
}: {
  reportId: string;
  sectionId: string;
  sectionTitle: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleClick() {
    setStatus(null);

    const response = await fetch(
      `/api/reports/${reportId}/sections/${sectionId}/generate`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          instruction: `围绕「${sectionTitle}」整理工作空间中的现有依据与初步结论。`,
        }),
      },
    );

    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setStatus(body?.error ?? "生成章节失败");
      return;
    }

    setStatus("章节已更新");
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="stack">
      <button disabled={isPending} onClick={handleClick} type="button">
        {isPending ? "生成中..." : "生成章节"}
      </button>
      {status ? <p className="muted">{status}</p> : null}
    </div>
  );
}
