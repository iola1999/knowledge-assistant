import Link from "next/link";

import { AuthForm } from "@/components/shared/auth-form";
import { ui } from "@/lib/ui";

export default function RegisterPage() {
  return (
    <main className="mx-auto grid min-h-screen w-full max-w-[1320px] place-items-center px-6 py-10 md:px-8">
      <div className="grid w-full max-w-[560px] gap-4">
        <AuthForm mode="register" />
        <p className={ui.muted}>
          已有账号？ <Link className="text-app-accent hover:underline" href="/login">去登录</Link>
        </p>
      </div>
    </main>
  );
}
