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
  framed = true,
}: {
  sectionId?: string;
  workspaceId: string;
  initialTitle: string;
  initialPrompt?: string | null;
  framed?: boolean;
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
    <form id={sectionId} onSubmit={onSubmit} className={framed ? ui.sectionPanel : "grid"}>
      <h2 className="text-[1.1rem] font-semibold text-app-text">设置</h2>

      <div className="mt-4 grid gap-4">
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
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button className={cn(buttonStyles(), "justify-self-start")} disabled={isPending} type="submit">
          {isPending ? "保存中..." : "保存设置"}
        </button>
        {status ? <span className={ui.muted}>{status}</span> : null}
      </div>
    </form>
  );
}
