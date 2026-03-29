"use client";

import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useEffect, useId } from "react";

import { buttonStyles, cn, ui } from "@/lib/ui";

type ActionDialogTone = "default" | "danger";

export function ActionDialog({
  open,
  title,
  description,
  children,
  error,
  confirmLabel,
  cancelLabel = "取消",
  pendingLabel,
  onClose,
  onConfirm,
  confirmDisabled = false,
  isSubmitting = false,
  tone = "default",
  role = "dialog",
}: {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  error?: string | null;
  confirmLabel: string;
  cancelLabel?: string;
  pendingLabel?: string;
  onClose: () => void;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  isSubmitting?: boolean;
  tone?: ActionDialogTone;
  role?: "dialog" | "alertdialog";
}) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && !isSubmitting) {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSubmitting, onClose, open]);

  if (!open) {
    return null;
  }

  const isDanger = tone === "danger";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 sm:px-6">
      <button
        type="button"
        aria-label="关闭对话框"
        className="absolute inset-0 bg-[rgba(23,22,18,0.26)] backdrop-blur-[2px]"
        disabled={isSubmitting}
        onClick={onClose}
      />

      <div
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        role={role}
        className={cn(
          "relative z-10 w-full max-w-[560px] overflow-hidden rounded-[32px] border border-app-border bg-[color:color-mix(in_srgb,var(--surface)_96%,var(--bg-elevated))] shadow-card",
        )}
      >
        <div
          aria-hidden="true"
          className="absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,rgba(155,112,71,0),rgba(155,112,71,0.4),rgba(155,112,71,0))]"
        />
        <div className="grid gap-6 p-6 md:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="grid gap-3">
              <p className={ui.eyebrow}>{isDanger ? "谨慎操作" : "继续操作"}</p>
              <div className="grid gap-2">
                <h2
                  id={titleId}
                  className="text-[28px] font-semibold leading-[1.05] tracking-[-0.04em] text-app-text md:text-[34px]"
                >
                  {title}
                </h2>
                {description ? (
                  <p
                    id={descriptionId}
                    className="max-w-[42ch] text-sm leading-6 text-app-muted-strong"
                  >
                    {description}
                  </p>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              aria-label="关闭对话框"
              className={cn(
                buttonStyles({ variant: "ghost", size: "sm" }),
                "h-9 w-9 rounded-full p-0 text-xl leading-none",
              )}
              disabled={isSubmitting}
              onClick={onClose}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>

          {children ? <div className="grid gap-3">{children}</div> : null}

          {error ? <p className={ui.error}>{error}</p> : null}

          <div className="flex flex-wrap justify-end gap-2.5 border-t border-app-border/70 pt-4">
            <button
              type="button"
              className={buttonStyles({ variant: "secondary" })}
              disabled={isSubmitting}
              onClick={onClose}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              className={buttonStyles({ variant: isDanger ? "danger" : "primary" })}
              disabled={isSubmitting || confirmDisabled}
              onClick={onConfirm}
            >
              {isSubmitting ? pendingLabel ?? confirmLabel : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TextPromptDialog({
  open,
  title,
  description,
  label,
  value,
  placeholder,
  hint,
  error,
  confirmLabel,
  cancelLabel = "取消",
  pendingLabel,
  onClose,
  onConfirm,
  onValueChange,
  confirmDisabled = false,
  isSubmitting = false,
}: {
  open: boolean;
  title: string;
  description?: string;
  label: string;
  value: string;
  placeholder?: string;
  hint?: string;
  error?: string | null;
  confirmLabel: string;
  cancelLabel?: string;
  pendingLabel?: string;
  onClose: () => void;
  onConfirm: () => void;
  onValueChange: (value: string) => void;
  confirmDisabled?: boolean;
  isSubmitting?: boolean;
}) {
  const inputId = useId();

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !confirmDisabled && !isSubmitting) {
      event.preventDefault();
      onConfirm();
    }
  }

  return (
    <ActionDialog
      open={open}
      title={title}
      description={description}
      error={error}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      pendingLabel={pendingLabel}
      onClose={onClose}
      onConfirm={onConfirm}
      confirmDisabled={confirmDisabled}
      isSubmitting={isSubmitting}
    >
      <label htmlFor={inputId} className={ui.label}>
        <span>{label}</span>
        <input
          id={inputId}
          autoFocus
          className={ui.input}
          disabled={isSubmitting}
          maxLength={120}
          onChange={(event) => {
            onValueChange(event.target.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          type="text"
          value={value}
        />
      </label>
      {hint ? <p className={ui.muted}>{hint}</p> : null}
    </ActionDialog>
  );
}
