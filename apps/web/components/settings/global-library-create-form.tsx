"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  KNOWLEDGE_LIBRARY_STATUS,
  type KnowledgeLibraryStatus,
} from "@anchordesk/contracts";

import { useMessage } from "@/components/shared/message-provider";
import { buttonStyles, ui } from "@/lib/ui";

export function GlobalLibraryCreateForm() {
  const router = useRouter();
  const message = useMessage();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<KnowledgeLibraryStatus>(
    KNOWLEDGE_LIBRARY_STATUS.DRAFT,
  );
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    try {
      const response = await fetch("/api/knowledge-libraries", {
        method: "POST",
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
        | { error?: string; library?: { id: string } }
        | null;

      if (!response.ok || !body?.library?.id) {
        message.error(body?.error ?? "创建资料库失败");
        return;
      }

      message.success("资料库已创建");
      router.push(`/settings/libraries/${body.library.id}`);
      router.refresh();
    } catch (error) {
      message.error(error instanceof Error && error.message ? error.message : "创建资料库失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className={ui.sectionPanel}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 className="text-[1.1rem] font-semibold text-app-text">新建全局资料库</h2>
          <p className="text-[13px] leading-6 text-app-muted-strong">
            创建后会直接进入该资料库的上传和整理页
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className={ui.label}>
          资料库名称
          <input
            required
            className={ui.input}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：平台规范库"
          />
        </label>
        <label className={ui.label}>
          slug
          <input
            className={ui.input}
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="留空则由名称生成"
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
            placeholder="简要说明这个资料库面向什么内容和场景"
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

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button className={buttonStyles()} disabled={submitting} type="submit">
          {submitting ? "创建中..." : "创建并进入管理"}
        </button>
      </div>
    </form>
  );
}
