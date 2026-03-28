"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { WORKSPACE_PROMPT_MAX_LENGTH } from "@/lib/api/workspace-prompt";
import { buttonStyles, cn, ui } from "@/lib/ui";

export function CreateWorkspaceForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [workspacePrompt, setWorkspacePrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, workspacePrompt }),
    });

    try {
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "创建失败");
        return;
      }

      const body = (await response.json()) as { workspace: { id: string } };
      router.push(`/workspaces/${body.workspace.id}`);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className={cn(ui.panelLarge, "grid gap-5 p-6 md:p-7")}>
      <div className="grid gap-2">
        <p className={ui.eyebrow}>Create Space</p>
        <h2>新建工作空间</h2>
        <p className={ui.muted}>
          先定义空间名称，再补一条统一提示词。之后这个空间里的每次对话，都会自动沿用这条要求。
        </p>
      </div>
      <label className={ui.label}>
        空间名称
        <input
          className={ui.input}
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例如：产品发布资料库"
        />
      </label>
      <label className={ui.label}>
        <span className="flex items-center justify-between gap-3">
          <span>预置提示词</span>
          <span className="text-[12px] font-normal text-app-muted">
            {workspacePrompt.length}/{WORKSPACE_PROMPT_MAX_LENGTH}
          </span>
        </span>
        <textarea
          className={ui.textarea}
          rows={5}
          maxLength={WORKSPACE_PROMPT_MAX_LENGTH}
          value={workspacePrompt}
          onChange={(e) => setWorkspacePrompt(e.target.value)}
          placeholder="例如：默认使用简体中文；先给结论，再列依据；结论必须标注资料出处。"
        />
        <span className={cn(ui.muted, "text-[13px] leading-5")}>
          用来约束当前空间内所有会话的回答方式，比如语气、结构、优先关注点或证据要求。尽量短，不要重复业务背景。
        </span>
      </label>
      {error ? <p className={ui.error}>{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button
          className={cn(buttonStyles(), "justify-self-start")}
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "创建中..." : "创建空间"}
        </button>
        <span className={cn(ui.muted, "text-[13px]")}>创建后会自动生成一个默认对话。</span>
      </div>
    </form>
  );
}
