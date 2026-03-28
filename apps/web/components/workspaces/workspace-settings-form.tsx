"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { WORKSPACE_PROMPT_MAX_LENGTH } from "@/lib/api/workspace-prompt";
import { buttonStyles, cn, ui } from "@/lib/ui";

export function WorkspaceSettingsForm({
  sectionId,
  workspaceId,
  initialTitle,
  initialPrompt,
}: {
  sectionId?: string;
  workspaceId: string;
  initialTitle: string;
  initialPrompt?: string | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [workspacePrompt, setWorkspacePrompt] = useState(initialPrompt ?? "");
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
        workspacePrompt,
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
    <form id={sectionId} onSubmit={onSubmit} className={cn(ui.panelLarge, "grid gap-5 p-6")}>
      <div className="grid gap-2">
        <p className={ui.eyebrow}>General</p>
        <h2>空间信息</h2>
        <p className={ui.muted}>
          这里维护空间名称和统一提示词。统一提示词会在每次提问时自动附加给助手。
        </p>
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
          onChange={(event) => setWorkspacePrompt(event.target.value)}
          placeholder="例如：默认使用简体中文；先给结论，再列依据；结论必须标注资料出处。"
        />
        <span className={cn(ui.muted, "text-[13px] leading-5")}>
          适合放稳定不变的回答要求，例如输出结构、引用要求、默认语言和优先关注点。尽量保持简短。
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button className={cn(buttonStyles(), "justify-self-start")} disabled={isPending} type="submit">
          {isPending ? "保存中..." : "保存空间设置"}
        </button>
        {status ? <span className={ui.muted}>{status}</span> : null}
      </div>
    </form>
  );
}
