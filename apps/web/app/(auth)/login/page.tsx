import Link from "next/link";

import { AuthForm } from "@/components/shared/auth-form";
import { ui } from "@/lib/ui";

export default function LoginPage() {
  return (
    <main className="mx-auto grid min-h-screen w-full max-w-[1320px] place-items-center px-6 py-10 md:px-8">
      <div className="grid w-full max-w-[560px] gap-4">
        <AuthForm mode="login" />
        <p className={ui.muted}>
          还没有账号？ <Link className="text-app-accent hover:underline" href="/register">去注册</Link>
        </p>
      </div>
    </main>
  );
}
