import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/shared/auth-form";
import { readRegistrationEnabled } from "@/lib/auth/registration";
import { ui } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (!(await readRegistrationEnabled())) {
    redirect("/login");
  }

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
