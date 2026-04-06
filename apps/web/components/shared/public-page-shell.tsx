import type { ReactNode } from "react";

import { AnchorDeskLogo } from "@/components/icons";

export function PublicPageShell({
  productName = "AnchorDesk",
  pageLabel,
  title,
  children,
  footer,
}: {
  productName?: string;
  pageLabel: string;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-app-bg">
      <header className="sticky top-0 z-10 border-b border-app-border/60 bg-app-bg-elevated/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1080px] items-center gap-2.5 px-4 py-2.5 md:px-6">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-app-primary">
            <AnchorDeskLogo className="size-[14px] text-app-primary-contrast" />
          </span>
          <span className="text-[12px] font-medium text-app-muted-strong">{productName}</span>
          <span className="mx-1 text-[11px] text-app-muted">·</span>
          <span className="text-[12px] text-app-muted">{pageLabel}</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col gap-5 px-4 py-6 md:px-6 md:py-7">
        {title ? <div className="px-0.5">{title}</div> : null}
        {children}
      </main>

      {footer ? (
        <footer className="border-t border-app-border/50 py-4">
          <div className="mx-auto max-w-[1080px] px-4 md:px-6">{footer}</div>
        </footer>
      ) : null}
    </div>
  );
}

