import Link from "next/link";

import { AuthForm } from "@/components/shared/auth-form";
import { readRegistrationEnabled } from "@/lib/auth/registration";
import { ui } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const registrationEnabled = await readRegistrationEnabled();

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-[1320px] place-items-center px-6 py-10 md:px-8">
      <div className="grid w-full max-w-[560px] gap-4">
        <AuthForm mode="login" registrationEnabled={registrationEnabled} />
        {registrationEnabled ? (
          <p className={ui.muted}>
            还没有账号？{" "}
            <Link className="text-app-accent hover:underline" href="/register">
              去注册
            </Link>
          </p>
        ) : (
          <p className={ui.muted}>当前未开放注册</p>
        )}
      </div>
    </main>
  );
}
