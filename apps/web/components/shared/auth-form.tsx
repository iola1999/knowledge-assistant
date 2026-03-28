"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { getAuthFormErrorMessage } from "@/lib/auth/form-error";
import { buttonStyles, cn, ui } from "@/lib/ui";

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
      setError(getAuthFormErrorMessage({ error: err, mode }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className={cn(ui.panelLarge, "grid gap-4")}>
      <div className="space-y-2">
        <p className={ui.eyebrow}>{mode === "login" ? "Login" : "Register"}</p>
        <h1>{mode === "login" ? "登录" : "注册"}</h1>
      </div>
      {mode === "register" ? (
        <label className={ui.label}>
          显示名
          <input
            className={ui.input}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
      ) : null}
      <label className={ui.label}>
        用户名
        <input
          className={ui.input}
          required
          minLength={3}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </label>
      <label className={ui.label}>
        密码
        <input
          className={ui.input}
          required
          type="password"
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error ? <p className={ui.error}>{error}</p> : null}
      <button className={buttonStyles()} disabled={loading} type="submit">
        {loading ? "处理中..." : mode === "login" ? "登录" : "创建账号"}
      </button>
      {mode === "login" ? (
        <p className={ui.muted}>首次启动请先注册账号，创建后再回来登录。</p>
      ) : null}
    </form>
  );
}
