"use client";

import { useState } from "react";

export function Composer({ conversationId }: { conversationId: string }) {
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<string | null>(null);

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
      setContent("");
      setStatus("消息已保存，已请求 Agent。刷新页面可查看新回复。");
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
      <button type="submit">发送</button>
      {status ? <p>{status}</p> : null}
    </form>
  );
}
