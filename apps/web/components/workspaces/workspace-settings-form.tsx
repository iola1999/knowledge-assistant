"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { buttonStyles, cn, ui } from "@/lib/ui";

export function WorkspaceSettingsForm({
  sectionId,
  workspaceId,
  initialTitle,
  initialDescription,
  initialIndustry,
}: {
  sectionId?: string;
  workspaceId: string;
  initialTitle: string;
  initialDescription?: string | null;
  initialIndustry?: string | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [industry, setIndustry] = useState(initialIndustry ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    const response = await fetch(`/api/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title,
        description,
        industry,
      }),
    });
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;

    if (!response.ok) {
      setStatus(body?.error ?? "保存空间设置失败。");
      return;
    }

    setStatus("空间设置已保存。");
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <form id={sectionId} onSubmit={onSubmit} className={cn(ui.panelLarge, "grid gap-4")}>
      <div className="grid gap-2">
        <p className={ui.eyebrow}>General</p>
        <h2>空间信息</h2>
        <p className={ui.muted}>这里维护空间名称、说明和行业标签，方便后续长期稳定使用。</p>
      </div>

      <label className={ui.label}>
        空间名称
        <input
          required
          className={ui.input}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label className={ui.label}>
        行业
        <input
          className={ui.input}
          value={industry}
          onChange={(event) => setIndustry(event.target.value)}
        />
      </label>
      <label className={ui.label}>
        空间说明
        <textarea
          className={ui.textarea}
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button className={buttonStyles()} disabled={isPending} type="submit">
          {isPending ? "保存中..." : "保存空间设置"}
        </button>
        {status ? <span className={ui.muted}>{status}</span> : null}
      </div>
    </form>
  );
}
