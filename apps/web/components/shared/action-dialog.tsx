"use client";

import { createPortal } from "react-dom";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from "react";

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
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

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

  if (!open || !isMounted) {
    return null;
  }

  const isDanger = tone === "danger";

  return createPortal(
    <div className="fixed inset-0 z-70 flex items-center justify-center px-3 py-4 sm:px-5">
      <button
        type="button"
        aria-label="关闭对话框"
        className="absolute inset-0 bg-[rgba(25,28,30,0.24)] backdrop-blur-[2px]"
        disabled={isSubmitting}
        onClick={onClose}
      />

      <div
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        role={role}
        className={cn(
          ui.dialog,
          "relative z-10 w-full max-w-[560px] overflow-hidden rounded-2xl bg-app-surface-lowest/97",
        )}
      >
        <div className="grid gap-5 p-5 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="grid gap-2.5">
              <p className={ui.eyebrow}>{isDanger ? "谨慎操作" : "继续操作"}</p>
              <div className="grid gap-1.5">
                <h2
                  id={titleId}
                  className="text-[20px] font-semibold leading-[1.15] tracking-[-0.025em] text-app-text md:text-[22px]"
                >
                  {title}
                </h2>
                {description ? (
                  <p
                    id={descriptionId}
                    className="max-w-[42ch] text-[13px] leading-5 text-app-muted-strong"
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
                buttonStyles({ variant: "ghost", size: "sm", shape: "icon" }),
                "size-8 text-lg leading-none text-app-secondary hover:bg-app-surface-high/70",
              )}
              disabled={isSubmitting}
              onClick={onClose}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>

          {children ? <div className="grid gap-2.5">{children}</div> : null}

          {error ? <p className={ui.error}>{error}</p> : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-app-outline-variant/14 pt-3.5">
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
    </div>,
    document.body,
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
