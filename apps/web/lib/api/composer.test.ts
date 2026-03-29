import { describe, expect, it } from "vitest";

import {
  resolveComposerHeading,
  resolveComposerStageTextareaSizing,
  resolveComposerSubmitStatus,
} from "./composer";

describe("resolveComposerHeading", () => {
  it("returns null when title and description are both empty", () => {
    expect(
      resolveComposerHeading({
        title: "   ",
        description: "\n",
      }),
    ).toBeNull();
  });

  it("keeps non-empty heading content", () => {
    expect(
      resolveComposerHeading({
        title: "  输入 / 粘贴你的问题  ",
        description: "  直接告诉助手你要完成什么  ",
      }),
    ).toEqual({
      title: "输入 / 粘贴你的问题",
      description: "直接告诉助手你要完成什么",
    });
  });
});

describe("resolveComposerSubmitStatus", () => {
  it("stays silent after a successful submit", () => {
    expect(resolveComposerSubmitStatus()).toBeNull();
    expect(resolveComposerSubmitStatus("   ")).toBeNull();
  });

  it("surfaces agent failures after the message is saved", () => {
    expect(resolveComposerSubmitStatus("queue offline")).toBe(
      "消息已保存，但 Agent 处理失败：queue offline",
    );
  });
});

describe("resolveComposerStageTextareaSizing", () => {
  it("keeps the stage composer compact by default", () => {
    expect(resolveComposerStageTextareaSizing()).toEqual({
      minRows: 1,
      minHeight: 28,
      maxHeight: 224,
    });
  });

  it("allows a slightly taller starting point when the page requests more rows", () => {
    expect(resolveComposerStageTextareaSizing(2)).toEqual({
      minRows: 2,
      minHeight: 56,
      maxHeight: 224,
    });
  });

  it("clamps oversized initial rows so the composer does not become bloated again", () => {
    expect(resolveComposerStageTextareaSizing(9)).toEqual({
      minRows: 3,
      minHeight: 84,
      maxHeight: 224,
    });
  });
});
