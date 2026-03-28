export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export const ui = {
  page: "mx-auto flex w-full max-w-[1320px] flex-col gap-6 px-6 py-8 md:px-8",
  pageNarrow: "mx-auto flex w-full max-w-[1040px] flex-col gap-6 px-6 py-8 md:px-8",
  stack: "flex flex-col gap-4",
  muted: "text-sm leading-6 text-app-muted",
  mutedStrong: "text-sm leading-6 text-app-muted-strong",
  error: "text-sm leading-6 text-red-600",
  eyebrow: "text-[11px] font-semibold uppercase tracking-[0.14em] text-app-accent",
  panel:
    "rounded-[28px] border border-app-border bg-white/90 p-6 shadow-soft backdrop-blur-sm",
  panelLarge:
    "rounded-[32px] border border-app-border bg-white/92 p-8 shadow-card backdrop-blur-sm",
  subpanel: "rounded-3xl border border-app-border bg-app-surface-soft/80 p-5 shadow-soft",
  subcard: "rounded-2xl border border-app-border bg-white/80 p-4 shadow-soft",
  toolbar: "flex flex-wrap items-start justify-between gap-3",
  actions: "flex flex-wrap items-center gap-2",
  label: "flex flex-col gap-2 text-sm font-medium text-app-muted-strong",
  input:
    "h-12 w-full rounded-2xl border border-app-border bg-app-surface-soft px-4 text-sm text-app-text outline-none transition placeholder:text-app-muted focus:border-app-border-strong focus:ring-4 focus:ring-app-accent/10",
  textarea:
    "w-full rounded-2xl border border-app-border bg-app-surface-soft px-4 py-3 text-sm text-app-text outline-none transition placeholder:text-app-muted focus:border-app-border-strong focus:ring-4 focus:ring-app-accent/10",
  select:
    "h-12 w-full rounded-2xl border border-app-border bg-app-surface-soft px-4 text-sm text-app-text outline-none transition focus:border-app-border-strong focus:ring-4 focus:ring-app-accent/10",
  codeChip:
    "inline-flex items-center rounded-full bg-app-surface-strong px-3 py-1 text-[13px] text-app-text",
};

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "md" | "sm";

export function buttonStyles({
  variant = "primary",
  size = "md",
  block = false,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
} = {}) {
  const sizeClass =
    size === "sm"
      ? "min-h-9 px-3 text-sm"
      : "min-h-11 px-4 text-sm";
  const variantClass =
    variant === "primary"
      ? "border-transparent bg-app-primary text-app-primary-contrast hover:bg-[#25211c]"
      : variant === "secondary"
        ? "border-app-border bg-white/90 text-app-text hover:border-app-border-strong hover:bg-white"
        : variant === "danger"
          ? "border-transparent bg-red-600 text-white hover:bg-red-700"
          : "border-transparent bg-transparent text-app-muted-strong hover:bg-black/5";

  return cn(
    "inline-flex items-center justify-center rounded-full border font-medium transition focus:outline-none focus:ring-4 focus:ring-app-accent/10 disabled:cursor-not-allowed disabled:opacity-60",
    sizeClass,
    variantClass,
    block && "w-full",
  );
}
