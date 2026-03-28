import { describe, expect, it } from "vitest";

import {
  buildConversationPrompt,
  normalizeWorkspacePrompt,
  summarizeWorkspacePrompt,
} from "./workspace-prompt";

describe("normalizeWorkspacePrompt", () => {
  it("returns null for empty values", () => {
    expect(normalizeWorkspacePrompt("   ")).toBeNull();
    expect(normalizeWorkspacePrompt(undefined)).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeWorkspacePrompt("  先给结论，再列依据。  ")).toBe(
      "先给结论，再列依据。",
    );
  });
});

describe("summarizeWorkspacePrompt", () => {
  it("collapses whitespace for compact workspace previews", () => {
    expect(summarizeWorkspacePrompt("先给结论。\n再列依据。", 20)).toBe(
      "先给结论。 再列依据。",
    );
  });

  it("truncates long prompts", () => {
    expect(summarizeWorkspacePrompt("a".repeat(20), 10)).toBe("aaaaaaa...");
  });
});

describe("buildConversationPrompt", () => {
  it("keeps the user message unchanged when no workspace prompt exists", () => {
    expect(
      buildConversationPrompt({
        content: "请总结当前资料。",
        workspacePrompt: "",
      }),
    ).toBe("请总结当前资料。");
  });

  it("prepends workspace-wide instructions before the current user request", () => {
    expect(
      buildConversationPrompt({
        content: "请总结当前资料。",
        workspacePrompt: "默认使用简体中文；先给结论，再列依据。",
      }),
    ).toContain("当前工作空间对所有回答的统一要求");

    expect(
      buildConversationPrompt({
        content: "请总结当前资料。",
        workspacePrompt: "默认使用简体中文；先给结论，再列依据。",
      }),
    ).toContain("当前用户问题：\n请总结当前资料。");
  });
});
