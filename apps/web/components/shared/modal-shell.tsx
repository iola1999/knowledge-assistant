"use client";

import { type ReactNode, useEffect, useId } from "react";

import { buttonStyles, cn, ui } from "@/lib/ui";

export function ModalShell({
  open,
  title,
  description,
  width = "md",
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  width?: "md" | "lg" | "xl";
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <button
        type="button"
        aria-label="关闭弹窗"
        className="absolute inset-0 bg-[rgba(23,22,18,0.34)] backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          ui.dialog,
          "relative z-10 max-h-[min(88vh,960px)] w-full overflow-hidden bg-white",
          width === "md"
            ? "max-w-[560px]"
            : width === "lg"
              ? "max-w-[760px]"
              : "max-w-[1040px]",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-app-border px-6 py-5">
          <div className="grid gap-1">
            <h2
              id={titleId}
              className="text-[20px] font-semibold tracking-[-0.03em] text-app-text"
            >
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="text-sm leading-6 text-app-muted">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className={cn(
              buttonStyles({ variant: "ghost", size: "sm", shape: "icon" }),
              "size-9 text-app-muted-strong",
            )}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="max-h-[calc(88vh-88px)] overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
