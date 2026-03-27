import Link from "next/link";

import { AuthForm } from "@/components/shared/auth-form";

export default function RegisterPage() {
  return (
    <main className="page stack">
      <AuthForm mode="register" />
      <p className="muted">
        已有账号？ <Link href="/login">去登录</Link>
      </p>
    </main>
  );
}
