import type { ReactNode } from "react";

import { cn } from "@/lib/ui";

export function SettingsShell({
  sidebar,
  children,
  mainClassName,
}: {
  sidebar: ReactNode;
  children: ReactNode;
  mainClassName?: string;
}) {
  return (
    <div className="min-h-screen">
      <div className="grid min-h-screen w-full grid-cols-1 xl:grid-cols-[252px_minmax(0,1fr)]">
        <aside className="border-b border-app-border/80 bg-white/45 xl:border-b-0 xl:border-r">
          {sidebar}
        </aside>

        <main
          className={cn(
            "min-w-0 px-4 py-4 md:px-5 md:py-5 xl:px-6 xl:py-6",
            mainClassName,
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export function SettingsShellSidebar({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col gap-4 px-4 py-4 md:px-5 md:py-5 xl:sticky xl:top-0 xl:h-screen xl:overflow-y-auto">
      {children}
    </div>
  );
}
