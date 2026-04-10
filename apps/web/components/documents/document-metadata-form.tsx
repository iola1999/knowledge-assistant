"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { buttonStyles, cn, ui } from "@/lib/ui";

type DocumentMetadataFormProps = {
  workspaceId: string;
  directories: Array<{ id: string; path: string }>;
  document: {
    id: string;
    title: string;
    directoryPath: string;
  };
};

export function DocumentMetadataForm({
  workspaceId,
  directories,
  document,
}: DocumentMetadataFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(document.title);
  const [directoryPath, setDirectoryPath] = useState(document.directoryPath);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    const response = await fetch(
      `/api/workspaces/${workspaceId}/documents/${document.id}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title,
          directoryPath,
        }),
      },
    );

    const body = (await response.json().catch(() => null)) as
      | {
          error?: string;
          document?: {
            title: string;
            directoryPath: string;
          };
        }
      | null;

    if (!response.ok || !body?.document) {
      setStatus(body?.error ?? "保存文档信息失败");
      return;
    }

    setTitle(body.document.title);
    setDirectoryPath(body.document.directoryPath);
    setStatus("文档信息已保存。");
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-3.5 rounded-[18px] border border-app-outline-variant/14 bg-app-surface-low/72 p-4 shadow-soft"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[14px] font-semibold text-app-text">文档属性</h3>
        <span className="text-[12px] text-app-muted">名称与目录</span>
      </div>
      <div className="grid gap-3.5">
        <label className={ui.label}>
          <span className="text-[13px]">文档名称</span>
          <input
            className={ui.input}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：产品手册-v2"
          />
        </label>
        <label className={ui.label}>
          <span className="text-[13px]">目录路径</span>
          <select
            className={ui.select}
            value={directoryPath}
            onChange={(event) => setDirectoryPath(event.target.value)}
          >
            {directories.map((directory) => (
              <option key={directory.id} value={directory.path}>
                {directory.path}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="pt-1.5">
        <button
          className={buttonStyles({ size: "sm", variant: "secondary", block: true })}
          disabled={isPending}
          type="submit"
        >
          {isPending ? "保存中..." : "保存更改"}
        </button>
      </div>
      {status ? <p className="pt-0.5 text-center text-[12px] text-app-muted">{status}</p> : null}
    </form>
  );
}
