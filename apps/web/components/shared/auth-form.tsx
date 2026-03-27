"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === "register") {
        const response = await fetch("/api/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username, password, displayName }),
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(body?.error ?? "Registration failed");
        }
      }

      const result = await signIn("credentials", {
        redirect: false,
        username,
        password,
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      router.push("/workspaces");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card form">
      <h1>{mode === "login" ? "登录" : "注册"}</h1>
      {mode === "register" ? (
        <label>
          显示名
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
      ) : null}
      <label>
        用户名
        <input
          required
          minLength={3}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </label>
      <label>
        密码
        <input
          required
          type="password"
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error ? <p className="error">{error}</p> : null}
      <button disabled={loading} type="submit">
        {loading ? "处理中..." : mode === "login" ? "登录" : "创建账号"}
      </button>
    </form>
  );
}
