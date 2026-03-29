from __future__ import annotations

import io
import os

import boto3
from botocore.config import Config
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from docx import Document
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph
from pypdf import PdfReader

from ocr import OCRProviderError, get_ocr_provider
from parser_utils import (
    build_blocks_from_items,
    compute_parse_score_bp,
    infer_file_kind,
    is_heading_style,
    split_paragraph_items,
)


class ParseRequest(BaseModel):
    workspace_id: str
    document_version_id: str
    storage_key: str
    sha256: str
    title: str | None = None
    logical_path: str | None = None


app = FastAPI(title="knowledge-assistant-parser")


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"{name} is not configured")
    return value


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=get_required_env("S3_ENDPOINT"),
        region_name=os.getenv("S3_REGION", "us-east-1"),
        aws_access_key_id=get_required_env("S3_ACCESS_KEY_ID"),
        aws_secret_access_key=get_required_env("S3_SECRET_ACCESS_KEY"),
        config=Config(
            s3={"addressing_style": "path" if os.getenv("S3_FORCE_PATH_STYLE") == "true" else "auto"}
        ),
    )


def get_bucket_name() -> str:
    return get_required_env("S3_BUCKET")


def get_object_bytes(storage_key: str) -> bytes:
    response = get_s3_client().get_object(Bucket=get_bucket_name(), Key=storage_key)
    body = response["Body"].read()
    if not body:
        raise HTTPException(status_code=404, detail="Object is empty")
    return body


def decode_text_bytes(data: bytes) -> str:
    for encoding in ("utf-8", "gb18030", "utf-16"):
        try:
            text = data.decode(encoding)
            if text.strip():
                return text
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="ignore")


def parse_text_document(data: bytes):
    text = decode_text_bytes(data)
    paragraph_items = split_paragraph_items(text)
    blocks, _ = build_blocks_from_items(paragraph_items, page_no=1)

    return {
        "page_count": 1,
        "pages": [
            {
                "page_no": 1,
                "width": None,
                "height": None,
                "text_length": len(text),
            }
        ],
        "blocks": blocks,
        "parse_score_bp": compute_parse_score_bp(1, len(text), len(blocks)),
    }


def iter_docx_blocks(document):
    for child in document.element.body.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, document)
        elif isinstance(child, CT_Tbl):
            yield Table(child, document)


def extract_table_text(table: Table) -> str:
    rows = []
    for row in table.rows:
        cells = [cell.text.strip() for cell in row.cells]
        if any(cells):
            rows.append(" | ".join(cells))
    return "\n".join(rows).strip()


def parse_docx_document(data: bytes):
    document = Document(io.BytesIO(data))
    block_items = []

    for item in iter_docx_blocks(document):
        if isinstance(item, Paragraph):
            text = item.text.strip()
            if not text:
                continue
            block_items.append(
                {
                    "text": text,
                    "force_heading": is_heading_style(getattr(item.style, "name", None)),
                    "heading_level": (
                        int(getattr(item.style, "name", "Heading 1").split()[-1])
                        if is_heading_style(getattr(item.style, "name", None))
                        and getattr(item.style, "name", "").split()[-1].isdigit()
                        else None
                    ),
                }
            )
        elif isinstance(item, Table):
            text = extract_table_text(item)
            if not text:
                continue
            block_items.append(
                {
                    "text": text,
                    "force_heading": False,
                    "heading_level": None,
                    "block_type": "table",
                }
            )

    text = "\n\n".join(entry["text"] for entry in block_items)
    blocks, _ = build_blocks_from_items(block_items, page_no=1)

    return {
        "page_count": 1,
        "pages": [
            {
                "page_no": 1,
                "width": None,
                "height": None,
                "text_length": len(text),
            }
        ],
        "blocks": blocks,
        "parse_score_bp": compute_parse_score_bp(1, len(text), len(blocks)),
    }


def build_document_from_page_texts(
    page_texts: list[dict],
    *,
    source_mode: str,
    ocr_provider: str | None = None,
):
    pages: list[dict] = []
    blocks: list[dict] = []
    inherited_headings: list[str] = []
    order_index = 1
    total_text_length = 0

    for page in page_texts:
        text = (page.get("text") or "").strip()
        total_text_length += len(text)
        pages.append(
            {
                "page_no": page["page_no"],
                "width": page.get("width"),
                "height": page.get("height"),
                "text_length": len(text),
            }
        )

        page_items = split_paragraph_items(text, line_number_scope="page")
        page_blocks, inherited_headings = build_blocks_from_items(
            page_items,
            page_no=page["page_no"],
            starting_order_index=order_index,
            inherited_headings=inherited_headings,
        )
        blocks.extend(page_blocks)
        order_index += len(page_blocks)

    return {
        "page_count": len(pages),
        "pages": pages,
        "blocks": blocks,
        "parse_score_bp": compute_parse_score_bp(len(pages), total_text_length, len(blocks)),
        "source": {
            "mode": source_mode,
            "ocr_provider": ocr_provider,
        },
    }


def extract_pdf_page_texts(data: bytes):
    reader = PdfReader(io.BytesIO(data))
    page_texts: list[dict] = []

    for page_index, page in enumerate(reader.pages, start=1):
        page_texts.append(
            {
                "page_no": page_index,
                "width": float(page.mediabox.width) if page.mediabox else None,
                "height": float(page.mediabox.height) if page.mediabox else None,
                "text": (page.extract_text() or "").strip(),
            }
        )

    return page_texts


def parse_pdf_document(data: bytes):
    page_texts = extract_pdf_page_texts(data)
    result = build_document_from_page_texts(page_texts, source_mode="native")

    if result["parse_score_bp"] > 0 and result["blocks"]:
        return result

    provider = get_ocr_provider()
    try:
        ocr_page_texts = provider.extract_pdf_pages(data)
    except OCRProviderError as error:
        raise HTTPException(status_code=422, detail=error.to_detail()) from error

    ocr_result = build_document_from_page_texts(
        ocr_page_texts,
        source_mode="ocr",
        ocr_provider=provider.name,
    )
    if ocr_result["parse_score_bp"] <= 0 or not ocr_result["blocks"]:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "ocr_no_text",
                "message": "OCR completed but no structured text was produced.",
                "ocr_provider": provider.name,
                "recoverable": True,
            },
        )

    return ocr_result


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/parse")
def parse_document(request: ParseRequest):
    file_kind = infer_file_kind(request.storage_key, request.logical_path)
    data = get_object_bytes(request.storage_key)

    if file_kind == "pdf":
        return parse_pdf_document(data)
    if file_kind == "docx":
        return parse_docx_document(data)
    if file_kind == "text":
        return parse_text_document(data)

    raise HTTPException(status_code=415, detail=f"Unsupported file type: {file_kind}")
