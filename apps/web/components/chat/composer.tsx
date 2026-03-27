"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function Composer({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = content.trim();
    if (!prompt) return;

    setStatus("正在发送...");
    const response = await fetch(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: prompt }),
    });

    if (response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { agentError?: string }
        | null;
      setContent("");
      setStatus(
        body?.agentError
          ? `消息已保存，但 Agent 处理失败：${body.agentError}`
          : "消息已提交，正在刷新对话...",
      );
      startTransition(() => {
        router.refresh();
      });
    } else {
      setStatus("发送失败。");
    }
  }

  return (
    <form onSubmit={onSubmit} className="card form">
      <h3>提问</h3>
      <textarea
        required
        rows={4}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="输入你的问题..."
      />
      <button disabled={isPending} type="submit">
        {isPending ? "刷新中..." : "发送"}
      </button>
      {status ? <p>{status}</p> : null}
    </form>
  );
}
