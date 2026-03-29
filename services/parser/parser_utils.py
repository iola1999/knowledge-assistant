from __future__ import annotations

import re
from pathlib import Path


def infer_file_kind(storage_key: str, logical_path: str | None = None) -> str:
    source = (logical_path or storage_key or "").lower()
    suffix = Path(source).suffix

    if suffix == ".pdf":
        return "pdf"
    if suffix == ".docx":
        return "docx"
    if suffix in {".txt", ".md", ".markdown"}:
        return "text"
    return "unknown"


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def strip_heading_markers(text: str) -> str:
    normalized = normalize_text(text)
    return re.sub(r"^#{1,6}\s+", "", normalized)


def split_paragraphs(text: str) -> list[str]:
    normalized = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    paragraphs = [
        part.strip()
        for part in re.split(r"\n\s*\n+", normalized)
        if part and part.strip()
    ]
    if paragraphs:
        return paragraphs

    fallback = normalize_text(normalized)
    return [fallback] if fallback else []


def split_paragraph_items(
    text: str,
    *,
    line_number_scope: str = "document",
) -> list[dict]:
    normalized = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    lines = normalized.split("\n")
    items: list[dict] = []
    paragraph_lines: list[str] = []
    start_line: int | None = None

    def flush(end_line: int):
        nonlocal paragraph_lines, start_line

        if start_line is None or not paragraph_lines:
            paragraph_lines = []
            start_line = None
            return

        item = {
            "text": "\n".join(paragraph_lines).strip(),
        }
        if line_number_scope == "page":
            item["page_line_start"] = start_line
            item["page_line_end"] = end_line
        else:
            item["line_start"] = start_line
            item["line_end"] = end_line
        items.append(item)
        paragraph_lines = []
        start_line = None

    for line_no, line in enumerate(lines, start=1):
        if line.strip():
            if start_line is None:
                start_line = line_no
            paragraph_lines.append(line.strip())
            continue

        flush(line_no - 1)

    flush(len(lines))

    if items:
        return items

    fallback = normalize_text(normalized)
    if not fallback:
        return []

    item = {"text": fallback}
    if line_number_scope == "page":
        item["page_line_start"] = 1
        item["page_line_end"] = max(1, len(lines))
    else:
        item["line_start"] = 1
        item["line_end"] = max(1, len(lines))
    return [item]


def extract_section_label(text: str) -> str | None:
    normalized = strip_heading_markers(text)
    if not normalized:
        return None

    match = re.match(
        r"^(第[\d一二三四五六七八九十百千零〇]+[编章节条款项]|[0-9]+(?:\.[0-9]+){1,4})",
        normalized,
    )
    if match:
        return match.group(1)
    return None


def guess_block_type(text: str, *, force_heading: bool = False) -> str:
    normalized = strip_heading_markers(text)
    if not normalized:
        return "paragraph"

    if force_heading or re.match(r"^#{1,6}\s+", normalize_text(text)):
        return "heading"

    if extract_section_label(normalized):
        return "heading"

    if len(normalized) <= 30 and normalized.endswith(("：", ":")):
        return "heading"

    return "paragraph"


def is_heading_style(style_name: str | None) -> bool:
    normalized = normalize_text(style_name or "").lower()
    return normalized.startswith("heading") or "标题" in normalized


def infer_heading_level(
    text: str,
    *,
    force_heading: bool = False,
    explicit_level: int | None = None,
) -> int | None:
    if explicit_level and explicit_level > 0:
        return explicit_level

    normalized = normalize_text(text)
    if not normalized:
        return None

    markdown_match = re.match(r"^(#{1,6})\s+", normalized)
    if markdown_match:
        return len(markdown_match.group(1))

    section_match = re.match(r"^第[\d一二三四五六七八九十百千零〇]+([编章节条款项])", strip_heading_markers(text))
    if section_match:
        return {
            "编": 1,
            "章": 2,
            "节": 3,
            "条": 4,
            "款": 5,
            "项": 6,
        }.get(section_match.group(1), 6)

    numbered_match = re.match(r"^([0-9]+(?:\.[0-9]+){0,4})", strip_heading_markers(text))
    if numbered_match:
        return min(6, numbered_match.group(1).count(".") + 3)

    if force_heading:
        return 6

    return None


def build_blocks_from_items(
    items: list[dict],
    *,
    page_no: int,
    starting_order_index: int = 1,
    inherited_headings: list[str] | None = None,
) -> tuple[list[dict], list[str]]:
    blocks: list[dict] = []
    current_headings = list(inherited_headings or [])
    order_index = starting_order_index

    for item in items:
        normalized = strip_heading_markers(item.get("text", ""))
        if not normalized:
            continue

        block_type = guess_block_type(
            item.get("text", ""),
            force_heading=bool(item.get("force_heading", False)),
        )
        if item.get("block_type"):
            block_type = item["block_type"]
        section_label = extract_section_label(normalized)

        if block_type == "heading":
            heading_level = infer_heading_level(
                item.get("text", ""),
                force_heading=bool(item.get("force_heading", False)),
                explicit_level=item.get("heading_level"),
            )
            if heading_level:
                current_headings = current_headings[: max(heading_level - 1, 0)]
                current_headings.append(normalized)
            else:
                current_headings = [normalized]
        elif not section_label and current_headings:
            section_label = extract_section_label(current_headings[-1]) or current_headings[-1]

        locator = {
            "line_start": item.get("line_start"),
            "line_end": item.get("line_end"),
            "page_line_start": item.get("page_line_start"),
            "page_line_end": item.get("page_line_end"),
            "block_index": order_index,
        }
        metadata_json = {
            **(item.get("metadata_json") or {}),
            "locator": {
                key: value for key, value in locator.items() if value is not None
            },
        }

        blocks.append(
            {
                "page_no": page_no,
                "order_index": order_index,
                "block_type": block_type,
                "section_label": section_label,
                "heading_path": current_headings.copy(),
                "text": normalized,
                "bbox_json": None,
                "metadata_json": metadata_json,
            }
        )
        order_index += 1

    return blocks, current_headings


def build_blocks_from_paragraphs(
    paragraphs: list[str],
    *,
    page_no: int,
    starting_order_index: int = 1,
    inherited_headings: list[str] | None = None,
) -> tuple[list[dict], list[str]]:
    return build_blocks_from_items(
        [{"text": paragraph, "force_heading": False} for paragraph in paragraphs],
        page_no=page_no,
        starting_order_index=starting_order_index,
        inherited_headings=inherited_headings,
    )


def compute_parse_score_bp(page_count: int, text_length: int, block_count: int) -> int:
    if page_count <= 0 or text_length <= 0 or block_count <= 0:
        return 0

    page_score = min(1.0, page_count / 5)
    text_score = min(1.0, text_length / 4000)
    block_score = min(1.0, block_count / max(page_count, 1))
    combined = page_score * 0.25 + text_score * 0.5 + block_score * 0.25
    return int(min(0.99, combined) * 10_000)
