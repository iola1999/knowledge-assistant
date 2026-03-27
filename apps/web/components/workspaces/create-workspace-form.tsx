"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
    <form onSubmit={onSubmit} className="card form">
      <h2>新建工作空间</h2>
      <label>
        标题
        <input required value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        行业
        <input value={industry} onChange={(e) => setIndustry(e.target.value)} />
      </label>
      <label>
        描述
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      {error ? <p className="error">{error}</p> : null}
      <button type="submit">创建</button>
    </form>
  );
}
