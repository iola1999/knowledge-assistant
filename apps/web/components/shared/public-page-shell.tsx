import type { ReactNode } from "react";

import { AnchorDeskLogo } from "@/components/icons";
import { cn, ui } from "@/lib/ui";

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
      <header
        data-slot="public-page-shell-header"
        className={cn(
          "sticky top-0 z-20 border-b border-[color:color-mix(in_srgb,var(--outline-variant)_12%,transparent)]",
          "bg-white/72 backdrop-blur-xl",
        )}
      >
        <div className="mx-auto flex max-w-[1120px] items-center gap-2.5 px-4 py-3 md:px-6">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-app-primary">
            <AnchorDeskLogo className="size-[14px] text-app-primary-contrast" />
          </span>
          <span className="text-[12px] font-medium text-app-muted-strong">{productName}</span>
          <span className="mx-1 text-[11px] text-app-muted">·</span>
          <span className="text-[12px] text-app-muted">{pageLabel}</span>
        </div>
      </header>

      <main
        data-slot="public-page-shell-main"
        className={cn(
          ui.pageNarrow,
          "flex-1 gap-6",
          "max-w-[1120px] px-4 py-7 md:px-6 md:py-10",
        )}
      >
        {title ? <div className="px-0.5">{title}</div> : null}
        {children}
      </main>

      {footer ? (
        <footer className="border-t border-app-border/50 py-4">
          <div className="mx-auto max-w-[1120px] px-4 md:px-6">{footer}</div>
        </footer>
      ) : null}
    </div>
  );
}
