import { describe, expect, it } from "vitest";
import { groundedAnswerSchema } from "@anchordesk/contracts";

import { normalizeGroundedAnswer } from "./grounded-answer";

const evidence = [
  {
    anchor_id: "550e8400-e29b-41d4-a716-446655440000",
    document_path: "资料库/项目A/发布手册.pdf",
    page_no: 12,
    label: "资料库/项目A/发布手册.pdf · 第12页 · 第8节",
    quote_text: "发布前需完成回归测试并通知相关成员。",
  },
];

describe("normalizeGroundedAnswer", () => {
  it("keeps only citations that exist in validated evidence", () => {
    const result = normalizeGroundedAnswer({
      draftText: "依据发布手册，上线前需要先完成回归测试。",
      evidence,
      parsed: {
        answer_markdown: "依据发布手册，上线前需要先完成回归测试。",
        citations: [
          {
            anchor_id: "550e8400-e29b-41d4-a716-446655440000",
            label: "模型自造标签",
            quote_text: "模型自造摘录",
          },
          {
            anchor_id: "550e8400-e29b-41d4-a716-446655440001",
            label: "不存在的引用",
            quote_text: "不应保留",
          },
        ],
      },
    });

    expect(result.citations).toEqual([
      {
        anchor_id: "550e8400-e29b-41d4-a716-446655440000",
        label: "资料库/项目A/发布手册.pdf · 第12页 · 第8节",
        quote_text: "发布前需完成回归测试并通知相关成员。",
      },
    ]);
  });

  it("keeps the answer text when no validated citation survives", () => {
    const result = normalizeGroundedAnswer({
      draftText: "目前资料不足，无法直接确认上线检查项。",
      evidence: [],
      parsed: {
        answer_markdown: "目前资料不足，无法直接确认上线检查项。",
        citations: [
          {
            anchor_id: "550e8400-e29b-41d4-a716-446655440001",
            label: "不存在的引用",
            quote_text: "不应保留",
          },
        ],
      },
    });

    expect(result.citations).toEqual([]);
    expect(result.answer_markdown).toBe("目前资料不足，无法直接确认上线检查项。");
  });

  it("accepts grounded answers without confidence metadata", () => {
    expect(
      groundedAnswerSchema.parse({
        answer_markdown: "你好，有什么我直接帮你处理的？",
        citations: [],
      }),
    ).toEqual({
      answer_markdown: "你好，有什么我直接帮你处理的？",
      citations: [],
    });
  });
});
