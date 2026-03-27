"use client";

import { useState } from "react";

export function UploadForm({ workspaceId }: { workspaceId: string }) {
  const [directoryPath, setDirectoryPath] = useState("资料库");
  const [status, setStatus] = useState<string | null>(null);

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
    const presignBody = (await presignResponse.json()) as {
      uploadUrl: string;
      key: string;
      bucket: string;
    };

    setStatus("正在上传文件...");
    await fetch(presignBody.uploadUrl, {
      method: "PUT",
      headers: {
        "content-type": file.type || "application/octet-stream",
      },
      body: file,
    });

    setStatus("正在创建文档任务...");
    await fetch(`/api/workspaces/${workspaceId}/documents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        storageKey: presignBody.key,
        sourceFilename: file.name,
        mimeType: file.type || "application/octet-stream",
        directoryPath,
      }),
    });

    setStatus("上传完成，任务已入队。");
  }

  return (
    <form onSubmit={onSubmit} className="card form">
      <h3>上传资料</h3>
      <label>
        目录路径
        <input value={directoryPath} onChange={(e) => setDirectoryPath(e.target.value)} />
      </label>
      <label>
        文件
        <input required name="file" type="file" />
      </label>
      <button type="submit">上传</button>
      {status ? <p>{status}</p> : null}
    </form>
  );
}
