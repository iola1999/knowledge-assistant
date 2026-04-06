"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useMessage } from "@/components/shared/message-provider";
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
  const message = useMessage();
  const [title, setTitle] = useState(initialTitle);
  const [workspacePrompt, setWorkspacePrompt] = useState(initialPrompt ?? "");
  const [isPending, startTransition] = useTransition();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
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
        message.error(body?.error ?? "保存空间设置失败");
        return;
      }

      message.success("空间设置已保存");
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      message.error(error instanceof Error && error.message ? error.message : "保存空间设置失败");
    }
  }

  return (
    <form id={sectionId} onSubmit={onSubmit} className={cn(ui.sectionPanel, "grid gap-4")}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-app-border pb-3">
        <div className="grid gap-0.5">
          <h2 className="text-[1rem] font-semibold text-app-text">基础设置</h2>
        </div>

        <button
          className={cn(buttonStyles({ size: "sm" }), "min-w-[104px]")}
          disabled={isPending}
          type="submit"
        >
          {isPending ? "保存中..." : "保存更改"}
        </button>
      </div>

      <div className="grid gap-4">
        <label className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
          <div className="grid content-start gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-app-secondary">
              Space Name
            </span>
            <span className="text-[14px] font-semibold text-app-text">空间名称</span>
          </div>
          <input
            required
            className={ui.input}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <label className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
          <div className="grid content-start gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-app-secondary">
              Space Prompt
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-semibold text-app-text">预置提示词</span>
              <span className={ui.chip}>
                {workspacePrompt.length}/{WORKSPACE_PROMPT_MAX_LENGTH}
              </span>
            </div>
          </div>

          <textarea
            className={cn(ui.textarea, "min-h-[168px] resize-y")}
            rows={6}
            maxLength={WORKSPACE_PROMPT_MAX_LENGTH}
            value={workspacePrompt}
            onChange={(event) => setWorkspacePrompt(event.target.value)}
            placeholder="补充空间级约束"
          />
        </label>
      </div>
    </form>
  );
}
