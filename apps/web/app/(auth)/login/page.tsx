import Link from "next/link";

import { AuthForm } from "@/components/shared/auth-form";
import { AuthShell } from "@/components/shared/auth-shell";
import { readRegistrationEnabled } from "@/lib/auth/registration";
import { ui } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const registrationEnabled = await readRegistrationEnabled();

  return (
    <AuthShell>
      <div className="grid gap-4">
        <AuthForm mode="login" registrationEnabled={registrationEnabled} />
        {registrationEnabled ? (
          <p className={ui.muted}>
            还没有账号？{" "}
            <Link
              className="font-medium text-app-secondary underline underline-offset-4 decoration-app-outline-variant/70 transition-colors hover:text-app-text"
              href="/register"
            >
              去注册
            </Link>
          </p>
        ) : (
          <p className={ui.muted}>当前未开放注册</p>
        )}
      </div>
    </AuthShell>
  );
}
