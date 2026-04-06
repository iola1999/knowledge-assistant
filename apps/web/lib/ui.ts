export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export const textSelectionStyles = {
  chrome: "select-none",
  content: "select-text",
} as const;

type FieldSize = "md" | "compact";
type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "dangerGhost";
type ButtonSize = "md" | "sm" | "xs";
type ButtonShape = "rounded" | "pill" | "icon";
type MenuTone = "default" | "danger";
type WorkspaceTileVariant = "default" | "create";
type ConversationControlSize = "default" | "compact";

export function inputStyles({ size = "md" }: { size?: FieldSize } = {}) {
  return cn(
    textSelectionStyles.content,
    "w-full rounded-xl border border-transparent bg-app-surface-low text-app-text outline-none transition placeholder:text-app-muted focus:border-app-outline-variant/45 focus:bg-app-surface-lowest focus-visible:ring-2 focus-visible:ring-app-secondary-fixed/55 focus-visible:ring-offset-1 focus-visible:ring-offset-app-surface-lowest",
    size === "compact"
      ? "h-9 px-3 text-[13px]"
      : "h-11 px-3.5 text-[14px]",
  );
}

export function textareaStyles({ size = "md" }: { size?: FieldSize } = {}) {
  return cn(
    textSelectionStyles.content,
    "w-full rounded-xl border border-transparent bg-app-surface-low text-app-text outline-none transition placeholder:text-app-muted focus:border-app-outline-variant/45 focus:bg-app-surface-lowest focus-visible:ring-2 focus-visible:ring-app-secondary-fixed/55 focus-visible:ring-offset-1 focus-visible:ring-offset-app-surface-lowest",
    size === "compact"
      ? "px-3 py-2 text-[13px]"
      : "px-3.5 py-2.5 text-[14px]",
  );
}

export function selectStyles({ size = "md" }: { size?: FieldSize } = {}) {
  return cn(
    textSelectionStyles.content,
    "w-full cursor-pointer rounded-xl border border-transparent bg-app-surface-low text-app-text outline-none transition focus:border-app-outline-variant/45 focus:bg-app-surface-lowest focus-visible:ring-2 focus-visible:ring-app-secondary-fixed/55 focus-visible:ring-offset-1 focus-visible:ring-offset-app-surface-lowest",
    size === "compact"
      ? "h-9 px-3 text-[13px]"
      : "h-11 px-3.5 text-[14px]",
  );
}

export const ui = {
  page: "mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-3 py-5 md:px-5 md:py-6",
  pageNarrow: "mx-auto flex w-full max-w-[980px] flex-col gap-4 px-3 py-5 md:px-5 md:py-6",
  stack: "flex flex-col gap-4",
  muted: "text-[13px] leading-5 text-app-muted",
  mutedStrong: "text-[13px] leading-5 text-app-muted-strong",
  error: "text-[13px] leading-5 text-red-600",
  eyebrow: "text-[11px] font-semibold uppercase tracking-[0.14em] text-app-accent",
  panel:
    "rounded-2xl border border-transparent bg-app-surface-lowest/64 p-4 shadow-soft backdrop-blur-sm",
  panelLarge:
    "rounded-2xl border border-transparent bg-app-surface-lowest/70 p-5 shadow-soft backdrop-blur-sm",
  sectionPanel:
    "rounded-[18px] border border-app-outline-variant/80 bg-app-surface-lowest/86 p-4 shadow-soft md:p-5",
  subpanel:
    "rounded-[16px] border border-app-outline-variant/80 bg-app-surface-low/92 p-4 shadow-soft",
  subcard:
    "rounded-[14px] border border-app-outline-variant/75 bg-app-surface-lowest/88 p-3.5 shadow-soft",
  popover:
    "rounded-2xl border border-app-outline-variant/55 bg-[color:color-mix(in_srgb,var(--surface-lowest)_72%,transparent)] p-1.5 shadow-soft backdrop-blur-xl",
  menu: "rounded-2xl border border-app-outline-variant/55 bg-[color:color-mix(in_srgb,var(--surface-lowest)_72%,transparent)] p-1.5 shadow-soft backdrop-blur-xl",
  dialog:
    "rounded-2xl border border-app-outline-variant/35 bg-[color:color-mix(in_srgb,var(--surface-lowest)_78%,transparent)] shadow-soft backdrop-blur-xl",
  toolbar:
    "flex flex-wrap items-start justify-between gap-2.5 rounded-xl border border-transparent bg-app-surface-low px-2.5 py-2",
  actions: "flex flex-wrap items-center gap-1.5",
  label: "flex flex-col gap-1.5 text-[13px] font-medium text-app-muted-strong",
  input: inputStyles(),
  textarea: textareaStyles(),
  select: selectStyles(),
  chip:
    "inline-flex items-center rounded-full border border-transparent bg-app-surface px-2.5 py-0.5 text-[11px] font-medium text-app-muted-strong",
  chipSoft:
    "inline-flex items-center rounded-full border border-transparent bg-app-secondary-fixed px-2.5 py-0.5 text-[11px] font-medium text-app-secondary",
  codeChip:
    "inline-flex items-center rounded-full bg-app-surface-strong px-3 py-1 text-[13px] text-app-text",
};

export function buttonStyles({
  variant = "primary",
  size = "md",
  block = false,
  shape = "rounded",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  shape?: ButtonShape;
} = {}) {
  const sizeClass =
    shape === "icon"
      ? size === "xs"
        ? "size-7 p-0 text-[12px]"
        : size === "sm"
          ? "size-8 p-0 text-[13px]"
          : "size-10 p-0 text-[14px]"
      : size === "xs"
        ? "min-h-7 px-2.5 text-[12px]"
        : size === "sm"
          ? "min-h-8 px-3 text-[13px]"
          : "min-h-10 px-3.5 text-[14px]";
  const radiusClass = shape === "pill" ? "rounded-full" : "rounded-xl";
  const variantClass =
    variant === "primary"
      ? "border-transparent bg-app-primary text-app-primary-contrast hover:bg-[#25211c]"
      : variant === "secondary"
        ? "border-transparent bg-app-surface-lowest text-app-secondary hover:bg-app-surface"
        : variant === "danger"
          ? "border-transparent bg-red-600 text-white hover:bg-red-700"
          : variant === "dangerGhost"
            ? "border-transparent bg-transparent text-red-600 hover:bg-red-50"
          : "border-transparent bg-transparent text-app-muted-strong hover:bg-app-surface-high/65";

  return cn(
    "inline-flex cursor-pointer items-center justify-center border font-medium transition focus:outline-none focus:ring-4 focus:ring-app-accent/10 disabled:cursor-not-allowed disabled:opacity-60",
    radiusClass,
    sizeClass,
    variantClass,
    block && "w-full",
  );
}

export function navItemStyles({ selected = false }: { selected?: boolean } = {}) {
  return selected
    ? "relative text-app-text before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-app-text"
    : "text-app-muted-strong hover:bg-app-surface-low/78 hover:text-app-text";
}

export function createConversationNavButtonStyles({
  active = false,
}: {
  active?: boolean;
} = {}) {
  return cn(
    "group relative flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border text-[13px] font-medium transition-all",
    active
      ? "border-transparent bg-app-surface-low text-app-text before:absolute before:inset-y-2 before:left-1 before:w-0.5 before:rounded-full before:bg-app-text hover:bg-app-surface"
      : "border-transparent bg-transparent text-app-secondary hover:bg-app-surface-low/72 hover:text-app-text",
  );
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

export function breadcrumbSwitcherTriggerStyles({
  open = false,
}: {
  open?: boolean;
} = {}) {
  return cn(
    buttonStyles({ variant: "ghost", size: "xs" }),
    "min-h-0 max-w-full gap-1 px-1.5 py-0.5 text-[12px] text-app-muted transition-[background-color,color,transform] duration-200 [transition-timing-function:var(--ease-out-quart)] hover:bg-app-surface-soft/74 hover:text-app-text",
    open && "bg-app-surface-soft/82 text-app-text",
  );
}

export function chipButtonStyles({
  active = false,
  size = "default",
}: {
  active?: boolean;
  size?: ConversationControlSize;
} = {}) {
  return cn(
    "inline-flex cursor-pointer items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50",
    size === "compact" ? "gap-1 px-2 py-0.5 text-[11px]" : "gap-1.5 px-2.5 py-1 text-[12px]",
    active
      ? "border-app-border-strong bg-app-surface-strong/65 text-app-text"
      : "border-transparent bg-transparent text-app-muted-strong hover:border-app-border/80 hover:bg-white/70 hover:text-app-text",
  );
}

export function tabButtonStyles({
  active,
  size = "default",
}: {
  active: boolean;
  size?: ConversationControlSize;
}) {
  return cn(
    "inline-flex cursor-pointer items-center border-b transition disabled:cursor-not-allowed disabled:opacity-45",
    size === "compact" ? "gap-1 px-0.5 pb-1 text-[11px]" : "gap-1.5 px-1 pb-1.5 text-[12px]",
    active
      ? "border-app-text text-app-text"
      : "border-transparent text-app-muted-strong hover:text-app-text",
  );
}

export function workspaceTileStyles({
  variant = "default",
}: {
  variant?: WorkspaceTileVariant;
} = {}) {
  return cn(
    ui.panel,
    "grid min-h-[200px] rounded-[20px] p-5 transition hover:-translate-y-px",
    variant === "create"
      ? "place-content-center justify-items-center gap-5 border-dashed border-app-outline-variant/70 text-center"
      : "grid-rows-[auto_1fr_auto] gap-4",
  );
}
