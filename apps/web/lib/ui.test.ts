import { describe, expect, it } from "vitest";

import {
  buttonStyles,
  chipButtonStyles,
  createConversationNavButtonStyles,
  inputStyles,
  menuItemStyles,
  navItemStyles,
  textSelectionStyles,
  tabButtonStyles,
  ui,
  workspaceTileStyles,
} from "./ui";

describe("inputStyles", () => {
  it("keeps fields visibly bounded against pale page surfaces", () => {
    expect(inputStyles()).toContain("h-11");
    expect(inputStyles()).toContain("rounded-xl");
    expect(inputStyles()).toContain("bg-app-surface-lowest/96");
    expect(inputStyles()).toContain("border-app-outline-variant/16");
    expect(inputStyles()).toContain("focus:border-app-outline-variant/28");
    expect(inputStyles()).toContain("focus:bg-app-surface-lowest");
    expect(inputStyles()).toContain("focus-visible:ring-2");
    expect(inputStyles()).toContain("focus-visible:ring-app-secondary-fixed/45");
    expect(inputStyles()).not.toContain("focus:ring-[3px]");
  });

  it("supports a compact field scale for dense workbench layouts", () => {
    expect(inputStyles({ size: "compact" })).toContain("h-9");
    expect(inputStyles({ size: "compact" })).toContain("rounded-xl");
    expect(inputStyles({ size: "compact" })).toContain("border-app-outline-variant/16");
    expect(inputStyles({ size: "compact" })).toContain("focus:bg-app-surface-lowest");
    expect(inputStyles({ size: "compact" })).toContain("focus-visible:ring-2");
    expect(inputStyles({ size: "compact" })).not.toContain("focus:ring-[3px]");
  });
});

describe("buttonStyles", () => {
  it("supports an extra-small button size without custom one-off classes", () => {
    expect(buttonStyles({ size: "xs" })).toContain("min-h-7");
    expect(buttonStyles({ size: "xs" })).toContain("text-[12px]");
  });

  it("uses integrated secondary fill instead of a raised white outlined style", () => {
    const classes = buttonStyles({ variant: "secondary" });

    expect(classes).toContain("bg-app-surface-low");
    expect(classes).toContain("text-app-secondary");
    expect(classes).toContain("border-app-outline-variant/16");
    expect(classes).not.toContain("bg-app-surface text-app-text");
  });

  it("supports icon buttons through the shared button primitive", () => {
    const classes = buttonStyles({ shape: "icon", size: "sm", variant: "ghost" });

    expect(classes).toContain("size-8");
    expect(classes).toContain("p-0");
    expect(classes).toContain("rounded-xl");
  });

  it("keeps pill buttons opt-in instead of making every button fully rounded", () => {
    expect(buttonStyles()).toContain("rounded-xl");
    expect(buttonStyles({ shape: "pill" })).toContain("rounded-full");
  });

  it("supports a danger ghost variant for destructive secondary actions", () => {
    const classes = buttonStyles({ variant: "dangerGhost", size: "sm" });

    expect(classes).toContain("text-red-600");
    expect(classes).toContain("hover:bg-red-50");
  });
});

describe("navItemStyles", () => {
  it("uses an anchor line treatment for selected nav items", () => {
    const classes = navItemStyles({ selected: true });

    expect(classes).toContain("relative");
    expect(classes).toContain("text-app-text");
    expect(classes).toContain("before:w-0.5");
    expect(classes).toContain("before:bg-app-text");
  });
});

describe("shared surface primitives", () => {
  it("uses editorial page scaffold sizing instead of the legacy wide scaffold", () => {
    expect(ui.page).toContain("max-w-[1200px]");
    expect(ui.page).toContain("gap-4");
    expect(ui.page).toContain("px-3 py-5");
    expect(ui.page).toContain("md:px-5 md:py-6");
    expect(ui.pageNarrow).toContain("max-w-[980px]");
    expect(ui.pageNarrow).not.toContain("max-w-[1320px]");
  });

  it("keeps panel surfaces lightweight with minimal border presence", () => {
    expect(ui.panel).toContain("rounded-2xl");
    expect(ui.panel).toContain("bg-app-surface-lowest/64");
    expect(ui.panel).toContain("border-transparent");
    expect(ui.panelLarge).toContain("rounded-2xl");
    expect(ui.panelLarge).toContain("bg-app-surface-lowest/70");
    expect(ui.panelLarge).toContain("border-transparent");
  });

  it("uses glass popover treatment with ghost border", () => {
    expect(ui.popover).toContain("backdrop-blur-md");
    expect(ui.popover).toContain("border-app-outline-variant/14");
    expect(ui.dialog).toContain("border-app-outline-variant/16");
    expect(ui.dialog).toContain("bg-app-surface-lowest/97");
    expect(ui.dialog).not.toContain("border-transparent");
  });

  it("uses low surface toolbar container styling", () => {
    expect(ui.toolbar).toContain("bg-app-surface-low");
    expect(ui.toolbar).toContain("rounded-xl");
    expect(ui.toolbar).toContain("border-transparent");
  });

  it("uses filled semantic chips instead of outlined pills", () => {
    expect(ui.chip).toContain("border-transparent");
    expect(ui.chip).toContain("bg-app-surface");
    expect(ui.chipSoft).toContain("border-transparent");
    expect(ui.chipSoft).toContain("bg-app-secondary-fixed");
  });
});

describe("createConversationNavButtonStyles", () => {
  it("uses integrated active treatment without raised white pill styling", () => {
    const classes = createConversationNavButtonStyles({ active: true });

    expect(classes).toContain("bg-app-surface-low");
    expect(classes).toContain("border-transparent");
    expect(classes).toContain("text-app-text");
    expect(classes).toContain("before:w-0.5");
    expect(classes).not.toContain("bg-white");
  });

  it("keeps the idle state aligned with muted navigation language", () => {
    const classes = createConversationNavButtonStyles({ active: false });

    expect(classes).toContain("bg-transparent");
    expect(classes).toContain("border-transparent");
    expect(classes).toContain("text-app-secondary");
    expect(classes).not.toContain("bg-app-primary");
  });

  it("does not use old selected white pill cues", () => {
    const classes = createConversationNavButtonStyles({ active: true });

    expect(classes).not.toContain("shadow-sm");
    expect(classes).toContain("text-app-text");
  });
});

describe("menuItemStyles", () => {
  it("returns the destructive menu treatment when requested", () => {
    const classes = menuItemStyles({ tone: "danger" });

    expect(classes).toContain("text-red-600");
    expect(classes).toContain("hover:bg-red-50");
  });

  it("supports a selected state for menu entries", () => {
    const classes = menuItemStyles({ selected: true });

    expect(classes).toContain("bg-app-surface-soft");
    expect(classes).toContain("font-medium");
    expect(classes).toContain("text-app-text");
  });
});

describe("conversation action helpers", () => {
  it("highlights active chip buttons", () => {
    const classes = chipButtonStyles({ active: true });

    expect(classes).toContain("border-app-border-strong");
    expect(classes).toContain("bg-app-surface-strong/65");
  });

  it("supports a compact chip density for dense conversation toolbars", () => {
    const classes = chipButtonStyles({ size: "compact" });

    expect(classes).toContain("px-2");
    expect(classes).toContain("py-0.5");
    expect(classes).toContain("text-[11px]");
  });

  it("keeps inactive tabs understated", () => {
    const classes = tabButtonStyles({ active: false });

    expect(classes).toContain("border-transparent");
    expect(classes).toContain("text-app-muted-strong");
  });

  it("supports compact tabs for tighter answer/source switching", () => {
    const classes = tabButtonStyles({ active: true, size: "compact" });

    expect(classes).toContain("gap-1");
    expect(classes).toContain("pb-1");
    expect(classes).toContain("text-[11px]");
  });
});

describe("workspaceTileStyles", () => {
  it("keeps standard workspace cards in a top-to-bottom information layout", () => {
    const classes = workspaceTileStyles();

    expect(classes).toContain("grid-rows-[auto_1fr_auto]");
    expect(classes).toContain("min-h-[188px]");
  });

  it("centers the create-workspace card content within the tile", () => {
    const classes = workspaceTileStyles({ variant: "create" });

    expect(classes).toContain("place-content-center");
    expect(classes).toContain("justify-items-center");
    expect(classes).toContain("text-center");
    expect(classes).toContain("border-dashed");
    expect(classes).toContain("border-app-outline-variant/42");
  });
});

describe("textSelectionStyles", () => {
  it("keeps app chrome non-selectable by default", () => {
    expect(textSelectionStyles.chrome).toBe("select-none");
  });

  it("keeps actual content explicitly selectable", () => {
    expect(textSelectionStyles.content).toBe("select-text");
  });
});
