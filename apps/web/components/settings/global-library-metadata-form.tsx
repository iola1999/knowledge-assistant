"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  KNOWLEDGE_LIBRARY_STATUS,
  type KnowledgeLibraryStatus,
} from "@anchordesk/contracts";

import { useMessage } from "@/components/shared/message-provider";
import { buttonStyles, ui } from "@/lib/ui";

export function GlobalLibraryMetadataForm({
  library,
}: {
  library: {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    status: KnowledgeLibraryStatus;
    documentCount: number;
    subscriptionCount: number;
  };
}) {
  const router = useRouter();
  const message = useMessage();
  const [title, setTitle] = useState(library.title);
  const [slug, setSlug] = useState(library.slug);
  const [description, setDescription] = useState(library.description ?? "");
  const [status, setStatus] = useState<KnowledgeLibraryStatus>(library.status);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      const response = await fetch(`/api/knowledge-libraries/${library.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title,
          slug,
          description,
          status,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        message.error(body?.error ?? "保存资料库失败");
        return;
      }

      message.success("资料库设置已保存");
      router.refresh();
    } catch (error) {
      message.error(error instanceof Error && error.message ? error.message : "保存资料库失败");
    } finally {
      setIsSaving(false);
    }
  }

  async function removeLibrary() {
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/knowledge-libraries/${library.id}`, {
        method: "DELETE",
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        message.error(body?.error ?? "删除资料库失败");
        return;
      }

      message.success("资料库已删除");
      router.push("/settings/libraries");
      router.refresh();
    } catch (error) {
      message.error(error instanceof Error && error.message ? error.message : "删除资料库失败");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <form onSubmit={save} className={ui.sectionPanel}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 className="text-[1.1rem] font-semibold text-app-text">资料库设置</h2>
          <p className="text-[13px] leading-6 text-app-muted-strong">
            管理资料库名称、slug、订阅状态，以及清空后删除
          </p>
        </div>
        <Link
          href="/settings/libraries"
          className={buttonStyles({ variant: "ghost", size: "sm" })}
        >
          返回列表
        </Link>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className={ui.label}>
          资料库名称
          <input
            required
            className={ui.input}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className={ui.label}>
          slug
          <input
            className={ui.input}
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
          />
        </label>
      </div>

      <div className="mt-4 grid gap-4">
        <label className={ui.label}>
          说明
          <textarea
            className={ui.textarea}
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <label className={ui.label}>
          状态
          <select
            className={ui.select}
            value={status}
            onChange={(event) => setStatus(event.target.value as KnowledgeLibraryStatus)}
          >
            <option value={KNOWLEDGE_LIBRARY_STATUS.DRAFT}>草稿</option>
            <option value={KNOWLEDGE_LIBRARY_STATUS.ACTIVE}>可订阅</option>
            <option value={KNOWLEDGE_LIBRARY_STATUS.ARCHIVED}>已归档</option>
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-[12px] text-app-muted">
        <span>{library.documentCount} 份资料</span>
        <span>{library.subscriptionCount} 个订阅</span>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button className={buttonStyles()} disabled={isSaving} type="submit">
          {isSaving ? "保存中..." : "保存设置"}
        </button>
        <button
          type="button"
          className={buttonStyles({ variant: "dangerGhost" })}
          disabled={
            isDeleting || library.documentCount > 0 || library.subscriptionCount > 0
          }
          onClick={() => void removeLibrary()}
        >
          {isDeleting ? "删除中..." : "删除空资料库"}
        </button>
      </div>

      {library.documentCount > 0 || library.subscriptionCount > 0 ? (
        <p className="mt-3 text-[13px] leading-6 text-app-muted">
          非空资料库请改为“已归档”；只有空资料库才能直接删除
        </p>
      ) : null}
    </form>
  );
}
