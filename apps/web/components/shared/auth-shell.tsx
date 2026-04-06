import type { ReactNode } from "react";

import { AnchorDeskLogo } from "@/components/icons";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-[100dvh] bg-app-bg">
      <div className="mx-auto grid min-h-[100dvh] w-full max-w-[1200px] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_520px]">
        <section className="hidden bg-app-surface-low px-10 py-12 lg:flex lg:flex-col lg:justify-between">
          <div className="grid gap-6">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-app-primary text-app-primary-contrast">
                <AnchorDeskLogo className="size-[18px]" />
              </span>
              <div className="grid">
                <span className="font-headline text-[18px] font-extrabold tracking-[-0.03em] text-app-text">
                  AnchorDesk
                </span>
                <span className="text-[12px] font-medium text-app-secondary">私有资料库知识工作台</span>
              </div>
            </div>
          </div>
        </section>

        <section className="flex min-w-0 items-center justify-center px-3 py-8 md:px-5 md:py-10">
          <div data-slot="auth-shell-content" className="w-full max-w-[420px]">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
