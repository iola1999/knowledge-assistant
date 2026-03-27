import Link from "next/link";

import { AuthForm } from "@/components/shared/auth-form";

export default function LoginPage() {
  return (
    <main className="page stack">
      <AuthForm mode="login" />
      <p className="muted">
        还没有账号？ <Link href="/register">去注册</Link>
      </p>
    </main>
  );
}
