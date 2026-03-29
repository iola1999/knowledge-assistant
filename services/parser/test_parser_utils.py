import unittest

from parser_utils import (
    build_blocks_from_items,
    build_blocks_from_paragraphs,
    compute_parse_score_bp,
    extract_section_label,
    guess_block_type,
    infer_heading_level,
    infer_file_kind,
    is_heading_style,
    split_paragraph_items,
    split_paragraphs,
)


class ParserUtilsTestCase(unittest.TestCase):
    def test_infer_file_kind(self):
        self.assertEqual(infer_file_kind("workspaces/ws/a.pdf"), "pdf")
        self.assertEqual(infer_file_kind("docs/product-guide.docx"), "docx")
        self.assertEqual(infer_file_kind("docs/notes.md"), "text")
        self.assertEqual(infer_file_kind("docs/archive.bin"), "unknown")

    def test_split_paragraphs(self):
        paragraphs = split_paragraphs("第一段\n\n第二段\r\n\r\n第三段")
        self.assertEqual(paragraphs, ["第一段", "第二段", "第三段"])

    def test_split_paragraph_items_preserve_line_ranges(self):
        items = split_paragraph_items("第一行\n第二行\n\n第三段\n第四行")

        self.assertEqual(
            items,
            [
                {"text": "第一行\n第二行", "line_start": 1, "line_end": 2},
                {"text": "第三段\n第四行", "line_start": 4, "line_end": 5},
            ],
        )

    def test_heading_detection(self):
        self.assertEqual(extract_section_label("第8节 上线检查"), "第8节")
        self.assertEqual(extract_section_label("5.1 发布条件"), "5.1")
        self.assertEqual(guess_block_type("第8节 上线检查"), "heading")
        self.assertEqual(guess_block_type("# 范围"), "heading")
        self.assertEqual(guess_block_type("发布前需要通知相关成员。"), "paragraph")
        self.assertTrue(is_heading_style("Heading 1"))
        self.assertTrue(is_heading_style("标题 2"))
        self.assertFalse(is_heading_style("Normal"))
        self.assertEqual(infer_heading_level("# 总则"), 1)
        self.assertEqual(infer_heading_level("## 范围"), 2)
        self.assertEqual(infer_heading_level("第一章 总则"), 2)
        self.assertEqual(infer_heading_level("第8节 上线检查"), 3)
        self.assertEqual(infer_heading_level("5.1 发布条件"), 4)

    def test_build_blocks_propagates_headings(self):
        blocks, headings = build_blocks_from_paragraphs(
            [
                "第8节 上线检查",
                "发布前需完成回归测试并通知相关成员。",
            ],
            page_no=3,
        )

        self.assertEqual(len(blocks), 2)
        self.assertEqual(blocks[0]["block_type"], "heading")
        self.assertEqual(blocks[1]["heading_path"], ["第8节 上线检查"])
        self.assertEqual(blocks[1]["section_label"], "第8节")
        self.assertEqual(headings, ["第8节 上线检查"])

    def test_build_blocks_from_items_respects_forced_heading(self):
        blocks, headings = build_blocks_from_items(
            [
                {"text": "发布范围", "force_heading": True},
                {"text": "本次上线覆盖移动端与后台管理端。", "force_heading": False},
            ],
            page_no=2,
        )

        self.assertEqual(blocks[0]["block_type"], "heading")
        self.assertEqual(blocks[0]["text"], "发布范围")
        self.assertEqual(blocks[1]["heading_path"], ["发布范围"])
        self.assertEqual(blocks[1]["metadata_json"]["locator"]["block_index"], 2)
        self.assertEqual(headings, ["发布范围"])

    def test_build_blocks_preserves_nested_heading_path(self):
        blocks, headings = build_blocks_from_items(
            [
                {"text": "# 总则", "force_heading": False},
                {"text": "## 范围", "force_heading": False},
                {"text": "第8节 上线检查", "force_heading": False},
                {"text": "发布前需完成回归测试。", "force_heading": False},
            ],
            page_no=1,
        )

        self.assertEqual(blocks[1]["heading_path"], ["总则", "范围"])
        self.assertEqual(blocks[2]["heading_path"], ["总则", "范围", "第8节 上线检查"])
        self.assertEqual(blocks[3]["heading_path"], ["总则", "范围", "第8节 上线检查"])
        self.assertEqual(headings, ["总则", "范围", "第8节 上线检查"])

    def test_compute_parse_score_bp(self):
        self.assertEqual(compute_parse_score_bp(0, 100, 2), 0)
        score = compute_parse_score_bp(3, 1800, 9)
        self.assertGreater(score, 0)
        self.assertLessEqual(score, 9900)


if __name__ == "__main__":
    unittest.main()
