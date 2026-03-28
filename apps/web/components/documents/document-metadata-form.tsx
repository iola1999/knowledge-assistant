"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  documentTypeOptions,
  parseTagsInput,
} from "@/lib/api/document-metadata";
import { buttonStyles, cn, ui } from "@/lib/ui";

type DocumentMetadataFormProps = {
  workspaceId: string;
  document: {
    id: string;
    title: string;
    directoryPath: string;
    docType: string;
    tags: string[];
  };
};

export function DocumentMetadataForm({
  workspaceId,
  document,
}: DocumentMetadataFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(document.title);
  const [directoryPath, setDirectoryPath] = useState(document.directoryPath);
  const [docType, setDocType] = useState(document.docType);
  const [tagsInput, setTagsInput] = useState(document.tags.join(", "));
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
          docType,
          tags: parseTagsInput(tagsInput),
        }),
      },
    );

    const body = (await response.json().catch(() => null)) as
      | {
          error?: string;
          document?: {
            title: string;
            directoryPath: string;
            docType: string;
            tagsJson?: string[];
          };
        }
      | null;

    if (!response.ok || !body?.document) {
      setStatus(body?.error ?? "保存文档信息失败");
      return;
    }

    setTitle(body.document.title);
    setDirectoryPath(body.document.directoryPath);
    setDocType(body.document.docType);
    setTagsInput((body.document.tagsJson ?? []).join(", "));
    setStatus("文档信息已保存。");
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className={cn(ui.panel, "grid gap-4")}>
      <div className={ui.toolbar}>
        <h3>资料管理</h3>
        <span className={ui.muted}>重命名、移动目录、类型和标签</span>
      </div>
      <label className={ui.label}>
        文档名称
        <input
          className={ui.input}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="例如：采购主合同-修订稿"
        />
      </label>
      <label className={ui.label}>
        目录路径
        <input
          className={ui.input}
          value={directoryPath}
          onChange={(event) => setDirectoryPath(event.target.value)}
          placeholder="例如：资料库/客户A/主合同"
        />
      </label>
      <label className={ui.label}>
        文档类型
        <select
          className={ui.select}
          value={docType}
          onChange={(event) => setDocType(event.target.value)}
        >
          {documentTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className={ui.label}>
        标签
        <input
          className={ui.input}
          value={tagsInput}
          onChange={(event) => setTagsInput(event.target.value)}
          placeholder="多个标签用逗号分隔"
        />
      </label>
      <button className={buttonStyles()} disabled={isPending} type="submit">
        {isPending ? "刷新中..." : "保存"}
      </button>
      {status ? <p className={ui.muted}>{status}</p> : null}
    </form>
  );
}
