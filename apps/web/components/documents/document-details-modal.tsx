"use client";

import { useState } from "react";

import { SlidersIcon } from "@/components/icons";
import { ModalShell } from "@/components/shared/modal-shell";
import { buttonStyles, cn } from "@/lib/ui";

export function DocumentDetailsModal({
  title = "文档详情",
  triggerLabel = "文档详情",
  children,
}: {
  title?: string;
  triggerLabel?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          buttonStyles({ variant: "secondary", size: "sm", shape: "pill" }),
          "min-w-0 max-w-full w-full justify-start gap-2 border-app-border/80 bg-white/82 pl-1.5 pr-3 shadow-soft backdrop-blur-sm hover:border-app-border-strong hover:bg-white sm:w-auto sm:justify-center",
        )}
        onClick={() => setOpen(true)}
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-app-surface-strong text-app-accent">
          <SlidersIcon className="size-[15px]" />
        </span>
        <span className="min-w-0 truncate text-[13px] font-medium text-app-text">
          {triggerLabel}
        </span>
      </button>

      <ModalShell open={open} title={title} width="xl" onClose={() => setOpen(false)}>
        {children}
      </ModalShell>
    </>
  );
}
