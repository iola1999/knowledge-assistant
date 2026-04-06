import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/shared/auth-form";
import { AuthShell } from "@/components/shared/auth-shell";
import { readRegistrationEnabled } from "@/lib/auth/registration";
import { ui } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (!(await readRegistrationEnabled())) {
    redirect("/login");
  }

  return (
    <AuthShell>
      <div className="grid gap-4">
        <AuthForm mode="register" />
        <p className={ui.muted}>
          已有账号？{" "}
          <Link
            className="font-medium text-app-secondary underline underline-offset-4 decoration-app-outline-variant/70 transition-colors hover:text-app-text"
            href="/login"
          >
            去登录
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
