"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { buttonStyles, cn, ui } from "@/lib/ui";

export function UploadForm({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [directoryPath, setDirectoryPath] = useState("资料库");
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const file = formData.get("file") as File | null;
    if (!file) {
      return;
    }

    setStatus("正在申请上传地址...");
    const presignResponse = await fetch(`/api/workspaces/${workspaceId}/uploads/presign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        directoryPath,
      }),
    });
    const presignBody = (await presignResponse.json().catch(() => null)) as
      | {
          uploadUrl: string;
          key: string;
          bucket: string;
          error?: string;
        }
      | null;

    if (!presignResponse.ok || !presignBody?.uploadUrl || !presignBody.key) {
      setStatus(presignBody?.error ?? "申请上传地址失败");
      return;
    }

    setStatus("正在上传文件...");
    const uploadResponse = await fetch(presignBody.uploadUrl, {
      method: "PUT",
      headers: {
        "content-type": file.type || "application/octet-stream",
      },
      body: file,
    });

    if (!uploadResponse.ok) {
      setStatus(`上传文件失败：${uploadResponse.status}`);
      return;
    }

    setStatus("正在创建文档任务...");
    const documentResponse = await fetch(`/api/workspaces/${workspaceId}/documents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        storageKey: presignBody.key,
        sourceFilename: file.name,
        mimeType: file.type || "application/octet-stream",
        directoryPath,
      }),
    });
    const documentBody = (await documentResponse.json().catch(() => null)) as
      | { error?: string }
      | null;

    if (!documentResponse.ok) {
      setStatus(documentBody?.error ?? "创建文档任务失败");
      return;
    }

    setStatus("上传完成，任务已入队。");
    event.currentTarget.reset();
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className={cn(ui.subcard, "grid gap-4")}>
      <h3>上传资料</h3>
      <label className={ui.label}>
        目录路径
        <input
          className={ui.input}
          value={directoryPath}
          onChange={(e) => setDirectoryPath(e.target.value)}
          placeholder="例如：资料库/合同/供应商"
        />
      </label>
      <label className={ui.label}>
        文件
        <input className={ui.input} required name="file" type="file" />
      </label>
      <button className={buttonStyles()} disabled={isPending} type="submit">
        {isPending ? "刷新中..." : "上传"}
      </button>
      {status ? <p className={ui.muted}>{status}</p> : null}
    </form>
  );
}
