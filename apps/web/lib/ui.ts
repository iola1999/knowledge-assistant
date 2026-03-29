export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type FieldSize = "md" | "compact";
type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "dangerGhost";
type ButtonSize = "md" | "sm" | "xs";
type ButtonShape = "pill" | "icon";
type MenuTone = "default" | "danger";

export function inputStyles({ size = "md" }: { size?: FieldSize } = {}) {
  return cn(
    "w-full border border-app-border bg-app-surface-soft text-app-text outline-none transition placeholder:text-app-muted focus:border-app-border-strong focus:ring-app-accent/10",
    size === "compact"
      ? "h-10 rounded-[18px] px-3.5 text-[14px] focus:ring-[3px]"
      : "h-12 rounded-2xl px-4 text-sm focus:ring-4",
  );
}

export function textareaStyles({ size = "md" }: { size?: FieldSize } = {}) {
  return cn(
    "w-full border border-app-border bg-app-surface-soft text-app-text outline-none transition placeholder:text-app-muted focus:border-app-border-strong focus:ring-app-accent/10",
    size === "compact"
      ? "rounded-[18px] px-3.5 py-2.5 text-[14px] focus:ring-[3px]"
      : "rounded-2xl px-4 py-3 text-sm focus:ring-4",
  );
}

export function selectStyles({ size = "md" }: { size?: FieldSize } = {}) {
  return cn(
    "w-full cursor-pointer border border-app-border bg-app-surface-soft text-app-text outline-none transition focus:border-app-border-strong focus:ring-app-accent/10",
    size === "compact"
      ? "h-10 rounded-[18px] px-3.5 text-[14px] focus:ring-[3px]"
      : "h-12 rounded-2xl px-4 text-sm focus:ring-4",
  );
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
  popover: "rounded-[26px] border border-app-border bg-white/98 p-3 shadow-card",
  menu: "rounded-[20px] border border-app-border bg-white/98 p-2 shadow-card",
  toolbar: "flex flex-wrap items-start justify-between gap-3",
  actions: "flex flex-wrap items-center gap-2",
  label: "flex flex-col gap-2 text-sm font-medium text-app-muted-strong",
  input: inputStyles(),
  textarea: textareaStyles(),
  select: selectStyles(),
  codeChip:
    "inline-flex items-center rounded-full bg-app-surface-strong px-3 py-1 text-[13px] text-app-text",
};

export function buttonStyles({
  variant = "primary",
  size = "md",
  block = false,
  shape = "pill",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  shape?: ButtonShape;
} = {}) {
  const sizeClass =
    shape === "icon"
      ? size === "xs"
        ? "size-8 p-0 text-[13px]"
        : size === "sm"
          ? "size-9 p-0 text-sm"
          : "size-11 p-0 text-sm"
      : size === "xs"
        ? "min-h-8 px-3 text-[13px]"
        : size === "sm"
          ? "min-h-9 px-3 text-sm"
          : "min-h-11 px-4 text-sm";
  const variantClass =
    variant === "primary"
      ? "border-transparent bg-app-primary text-app-primary-contrast hover:bg-[#25211c]"
      : variant === "secondary"
        ? "border-app-border bg-white/90 text-app-text hover:border-app-border-strong hover:bg-white"
        : variant === "danger"
          ? "border-transparent bg-red-600 text-white hover:bg-red-700"
          : variant === "dangerGhost"
            ? "border-transparent bg-transparent text-red-600 hover:bg-red-50"
          : "border-transparent bg-transparent text-app-muted-strong hover:bg-black/5";

  return cn(
    "inline-flex cursor-pointer items-center justify-center rounded-full border font-medium transition focus:outline-none focus:ring-4 focus:ring-app-accent/10 disabled:cursor-not-allowed disabled:opacity-60",
    sizeClass,
    variantClass,
    block && "w-full",
  );
}

export function navItemStyles({ selected = false }: { selected?: boolean } = {}) {
  return selected
    ? "bg-white text-app-text shadow-soft"
    : "text-app-muted-strong hover:bg-white/78 hover:text-app-text";
}

export function menuItemStyles({
  selected = false,
  tone = "default",
}: {
  selected?: boolean;
  tone?: MenuTone;
} = {}) {
  if (tone === "danger") {
    return "text-red-600 hover:bg-red-50";
  }

  return selected
    ? "bg-app-surface-soft font-medium text-app-text"
    : "text-app-muted-strong hover:bg-app-surface-soft/82 hover:text-app-text";
}

export function chipButtonStyles({ active = false }: { active?: boolean } = {}) {
  return cn(
    "inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] transition disabled:cursor-not-allowed disabled:opacity-50",
    active
      ? "border-app-border-strong bg-app-surface-strong/65 text-app-text"
      : "border-transparent bg-transparent text-app-muted-strong hover:border-app-border/80 hover:bg-white/70 hover:text-app-text",
  );
}

export function tabButtonStyles({ active }: { active: boolean }) {
  return cn(
    "inline-flex cursor-pointer items-center gap-2 border-b px-1 pb-2 text-[13px] transition disabled:cursor-not-allowed disabled:opacity-45",
    active
      ? "border-app-text text-app-text"
      : "border-transparent text-app-muted-strong hover:text-app-text",
  );
}
