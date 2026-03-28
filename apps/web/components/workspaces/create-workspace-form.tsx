"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { buttonStyles, cn, ui } from "@/lib/ui";

export function CreateWorkspaceForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [industry, setIndustry] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const response = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, industry, description }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "创建失败");
      return;
    }

    const body = (await response.json()) as { workspace: { id: string } };
    router.push(`/workspaces/${body.workspace.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className={cn(ui.panelLarge, "grid gap-4")}>
      <div className="grid gap-2">
        <p className={ui.eyebrow}>Create Space</p>
        <h2>新建工作空间</h2>
        <p className={ui.muted}>
          先把空间名称和背景说明定义清楚，后续的资料库、历史会话和输出结果都会沉淀在这里。
        </p>
      </div>
      <label className={ui.label}>
        标题
        <input
          className={ui.input}
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例如：供应商主合同审查"
        />
      </label>
      <label className={ui.label}>
        行业
        <input
          className={ui.input}
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="例如：制造业 / SaaS / 医疗"
        />
      </label>
      <label className={ui.label}>
        描述
        <textarea
          className={ui.textarea}
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="说明当前空间希望处理的资料主题、常见问题和输出目标。"
        />
      </label>
      {error ? <p className={ui.error}>{error}</p> : null}
      <button className={buttonStyles()} type="submit">
        创建空间
      </button>
    </form>
  );
}
