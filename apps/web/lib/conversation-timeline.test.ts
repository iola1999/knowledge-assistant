import { describe, expect, test } from "vitest";

import { MESSAGE_STATUS } from "@anchordesk/contracts";

import type { AssistantProcessTimelineEntry } from "@/lib/api/conversation-process";

import {
  buildConversationTimelineEntryView,
  canExpandConversationTimelineEntry,
} from "./conversation-timeline";

const baseEntry: AssistantProcessTimelineEntry = {
  id: "tool-1",
  kind: "tool_call",
  toolName: "fetch_source",
  status: MESSAGE_STATUS.COMPLETED,
  createdAt: "2026-03-30T12:00:00.000Z",
  completedAt: "2026-03-30T12:00:01.000Z",
  contentMarkdown: "已收到工具结果",
  input: null,
  output: null,
  error: null,
  progressText: null,
  elapsedSeconds: null,
};

describe("buildConversationTimelineEntryView", () => {
  test("surfaces obvious search arguments and search hits without exposing raw-only fields", () => {
    const view = buildConversationTimelineEntryView({
      ...baseEntry,
      toolName: "search_web_general",
      input: {
        query: "B站 影视飓风 广告报价",
        top_k: 5,
      },
      output: {
        ok: true,
        results: [
          {
            title: "影视飓风：从顶流UP主，到年入过亿的内容公司",
            url: "https://digitaling.com/articles/1347429.html",
            domain: "digitaling.com",
          },
          {
            title: "B站UP主接广告的正确姿势",
            url: "https://www.toolsite.example.com/ad-price",
            domain: "toolsite.example.com",
          },
        ],
      },
    });

    expect(view.displayName).toBe("搜索网页");
    expect(view.arguments).toEqual([{ label: "关键词", value: "B站 影视飓风 广告报价" }]);
    expect(view.previewSummary).toBe("命中 2 条候选链接");
    expect(view.previewItems).toEqual([
      {
        label: "结果 1",
        value: "影视飓风：从顶流UP主，到年入过亿的内容公司",
        meta: "digitaling.com",
        tone: "default",
        href: "https://digitaling.com/articles/1347429.html",
      },
      {
        label: "结果 2",
        value: "B站UP主接广告的正确姿势",
        meta: "toolsite.example.com",
        tone: "default",
        href: "https://www.toolsite.example.com/ad-price",
      },
    ]);
  });

  test("parses wrapped SDK tool payloads before building search previews", () => {
    const view = buildConversationTimelineEntryView({
      ...baseEntry,
      toolName: "search_web_general",
      input: {
        query: "Alibaba latest earnings report",
      },
      output: [
        {
          text: JSON.stringify({
            ok: true,
            results: [
              {
                title: "Financial Reports - Alibaba Investor Relations",
                url: "https://www.alibabagroup.com/en-US/ir-financial-results",
                domain: "alibabagroup.com",
              },
            ],
          }),
        },
      ],
    });

    expect(view.previewSummary).toBe("命中 1 条候选链接");
    expect(view.previewItems).toEqual([
      {
        label: "结果 1",
        value: "Financial Reports - Alibaba Investor Relations",
        meta: "alibabagroup.com",
        tone: "default",
        href: "https://www.alibabagroup.com/en-US/ir-financial-results",
      },
    ]);
  });

  test("hides search evaluations when the payload shape cannot be judged confidently", () => {
    const view = buildConversationTimelineEntryView({
      ...baseEntry,
      toolName: "search_web_general",
      input: {
        query: "Alibaba earnings",
      },
      output: [
        {
          text: "not-json",
        },
      ],
    });

    expect(view.previewSummary).toBeNull();
    expect(view.previewItems).toEqual([]);
  });

  test("surfaces the fetched URL and page excerpt for single-source reads", () => {
    const view = buildConversationTimelineEntryView({
      ...baseEntry,
      toolName: "fetch_source",
      input: {
        url: "https://www.example.com/articles/pricing-guide",
      },
      output: {
        ok: true,
        source: {
          url: "https://www.example.com/articles/pricing-guide",
          title: "品牌合作报价指南",
          paragraphs: [
            "影视飓风的定制商单价格在头部UP主中属于较高区间。",
            "具体报价会受投放形式和播放预期影响。",
          ],
        },
      },
    });

    expect(view.displayName).toBe("读取网页");
    expect(view.arguments).toEqual([
      { label: "链接", value: "https://www.example.com/articles/pricing-guide" },
    ]);
    expect(view.previewSummary).toBe("已抓取网页正文");
    expect(view.previewItems).toEqual([
      {
        label: "页面",
        value: "品牌合作报价指南",
        meta: "example.com",
        tone: "default",
        href: "https://www.example.com/articles/pricing-guide",
      },
      {
        label: "摘录",
        value: "影视飓风的定制商单价格在头部UP主中属于较高区间。",
        meta: null,
        tone: "default",
      },
    ]);
  });

  test("hides fetch summaries when batch fetch output is not parseable", () => {
    const view = buildConversationTimelineEntryView({
      ...baseEntry,
      toolName: "fetch_sources",
      input: {
        urls: ["https://www.example.com/a", "https://www.example.com/b"],
      },
      output: [
        {
          text: "not-json",
        },
      ],
    });

    expect(view.previewSummary).toBeNull();
    expect(view.previewItems).toEqual([]);
  });

  test("shows attachment page ranges directly but keeps internal document identifiers hidden", () => {
    const view = buildConversationTimelineEntryView({
      ...baseEntry,
      toolName: "read_conversation_attachment_range",
      input: {
        conversation_id: "conversation-1",
        document_id: "document-1",
        page_start: 3,
        page_end: 5,
      },
      output: {
        ok: true,
        document: {
          document_id: "document-1",
          document_title: "B站报价访谈纪要",
          loaded_page_start: 3,
          loaded_page_end: 5,
          pages: [
            {
              page_no: 3,
              text: "影视飓风在品牌广告定价上明显高于普通创作者。",
            },
          ],
        },
      },
    });

    expect(view.displayName).toBe("读取附件页段");
    expect(view.arguments).toEqual([{ label: "页段", value: "第 3-5 页" }]);
    expect(view.previewSummary).toBe("B站报价访谈纪要 · 第 3-5 页");
    expect(view.previewItems).toEqual([
      {
        label: "第 3 页",
        value: "影视飓风在品牌广告定价上明显高于普通创作者。",
        meta: null,
        tone: "default",
      },
    ]);
    expect(view.arguments.map((item) => item.value).join(" ")).not.toContain("document-1");
  });

  test("keeps run failures as non-expandable status rows", () => {
    const view = buildConversationTimelineEntryView({
      ...baseEntry,
      id: "status-1",
      kind: "status_event",
      toolName: null,
      status: MESSAGE_STATUS.FAILED,
      contentMarkdown: "运行失败：queue offline",
      error: "queue offline",
    });

    expect(view.displayName).toBe("运行失败");
    expect(view.previewSummary).toBe("queue offline");
    expect(view.previewItems).toEqual([]);
    expect(canExpandConversationTimelineEntry(view)).toBe(false);
  });

  test("turns thinking steps into compact expandable rows", () => {
    const view = buildConversationTimelineEntryView({
      ...baseEntry,
      id: "thinking-1",
      kind: "thinking",
      toolName: null,
      status: MESSAGE_STATUS.COMPLETED,
      contentMarkdown:
        "先确认当前分支已经提供了 thinking 事件，再决定如何穿插展示，并把旧的独立思考面板完全移除。",
      input: null,
      output: null,
      error: null,
    });

    expect(view.displayName.startsWith("先确认当前分支已经提供了 thinking 事件")).toBe(true);
    expect(view.displayName.endsWith("...")).toBe(true);
    expect(view.statusLabel).toBe("已分析");
    expect(view.icon).toBe("thinking");
    expect(view.detailText).toBe(
      "先确认当前分支已经提供了 thinking 事件，再决定如何穿插展示，并把旧的独立思考面板完全移除。",
    );
    expect(canExpandConversationTimelineEntry(view)).toBe(true);
  });
});

describe("canExpandConversationTimelineEntry", () => {
  test("expands tool rows when they carry raw payloads or richer previews", () => {
    const searchView = buildConversationTimelineEntryView({
      ...baseEntry,
      toolName: "search_workspace_knowledge",
      input: {
        workspace_id: "workspace-1",
        query: "招投标流程",
      },
      output: {
        ok: true,
        results: [
          {
            document_title: "采购制度",
            page_no: 4,
            snippet: "招投标流程需要经过采购负责人审批。",
          },
        ],
      },
    });

    expect(canExpandConversationTimelineEntry(searchView)).toBe(true);
  });
});
