from __future__ import annotations

import io
import json
import logging
import os

import boto3
from botocore.config import Config
from fastapi import FastAPI, HTTPException, Request as FastAPIRequest
from pydantic import BaseModel
from docx import Document
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph
from opentelemetry import propagate, trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.trace import SpanKind
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
    workspace_id: str | None = None
    library_id: str | None = None
    document_version_id: str
    storage_key: str
    sha256: str
    title: str | None = None
    logical_path: str | None = None


app = FastAPI(title="anchordesk-parser")
logger = logging.getLogger("anchordesk.parser")
_TRACING_INITIALIZED = False

if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
logger.propagate = False
logger.setLevel(getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO))


def init_tracing():
    global _TRACING_INITIALIZED

    if _TRACING_INITIALIZED:
        return

    resource = Resource.create(
        {
            SERVICE_NAME: "anchordesk-parser",
            "deployment.environment.name": os.getenv("NODE_ENV", "development"),
        }
    )
    provider = TracerProvider(resource=resource)

    trace_endpoint = os.getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT")
    base_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    exporter_endpoint = (
        trace_endpoint.strip()
        if isinstance(trace_endpoint, str) and trace_endpoint.strip()
        else f"{base_endpoint.rstrip('/')}/v1/traces"
        if isinstance(base_endpoint, str) and base_endpoint.strip()
        else None
    )

    if exporter_endpoint:
        provider.add_span_processor(
            BatchSpanProcessor(OTLPSpanExporter(endpoint=exporter_endpoint))
        )

    trace.set_tracer_provider(provider)
    _TRACING_INITIALIZED = True


def get_trace_log_context():
    span_context = trace.get_current_span().get_span_context()
    if not span_context or not span_context.is_valid:
        return {}

    return {
        "trace_id": format(span_context.trace_id, "032x"),
        "span_id": format(span_context.span_id, "016x"),
        "trace_flags": format(int(span_context.trace_flags), "02x"),
    }


def log_event(level: int, message: str, **fields):
    payload = {
        "environment": os.getenv("NODE_ENV", "development"),
        "level": logging.getLevelName(level).lower(),
        "message": message,
        "service": "parser",
        **get_trace_log_context(),
        **fields,
    }
    logger.log(level, json.dumps(payload, ensure_ascii=False))


def summarize_pdf_native_extraction(page_texts: list[dict]):
    ocr_candidate_page_numbers = [
        page["page_no"]
        for page in page_texts
        if not (page.get("text") or "").strip() and page.get("has_image") is True
    ]

    return {
        "page_count": len(page_texts),
        "native_text_page_count": sum(
            1 for page in page_texts if (page.get("text") or "").strip()
        ),
        "image_page_count": sum(1 for page in page_texts if page.get("has_image") is True),
        "ocr_candidate_page_count": len(ocr_candidate_page_numbers),
        "ocr_candidate_page_numbers": ocr_candidate_page_numbers,
    }


def summarize_document_result(result: dict):
    pages = result.get("pages", [])
    source = result.get("source") or {}
    return {
        "page_count": result.get("page_count"),
        "non_empty_page_count": sum(
            1 for page in pages if int(page.get("text_length") or 0) > 0
        ),
        "block_count": len(result.get("blocks", [])),
        "parse_score_bp": result.get("parse_score_bp"),
        "source_mode": source.get("mode"),
        "ocr_provider": source.get("ocr_provider"),
    }


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
                "has_image": len(page.images) > 0,
            }
        )

    return page_texts


def parse_pdf_document(data: bytes, *, log_fields: dict | None = None):
    page_texts = extract_pdf_page_texts(data)
    extraction_summary = summarize_pdf_native_extraction(page_texts)
    log_event(logging.INFO, "pdf native extraction completed", **(log_fields or {}), **extraction_summary)
    ocr_page_numbers = [
        page["page_no"]
        for page in page_texts
        if not (page.get("text") or "").strip() and page.get("has_image") is True
    ]

    if not ocr_page_numbers:
        result = build_document_from_page_texts(page_texts, source_mode="native")
        if result["parse_score_bp"] > 0 and result["blocks"]:
            log_event(
                logging.INFO,
                "pdf parse completed",
                **(log_fields or {}),
                **summarize_document_result(result),
            )
            return result

        log_event(
            logging.WARNING,
            "pdf parse failed",
            **(log_fields or {}),
            error_code="pdf_no_extractable_content",
            **summarize_document_result(result),
        )
        raise HTTPException(
            status_code=422,
            detail={
                "code": "pdf_no_extractable_content",
                "message": "No extractable PDF text found and no image pages were eligible for OCR.",
                "ocr_provider": None,
                "recoverable": True,
            },
        )

    provider = get_ocr_provider()
    log_event(
        logging.INFO,
        "pdf ocr started",
        **(log_fields or {}),
        ocr_provider=provider.name,
        ocr_candidate_page_count=len(ocr_page_numbers),
        ocr_candidate_page_numbers=ocr_page_numbers,
    )
    try:
        ocr_page_texts = provider.extract_pdf_pages(data, page_numbers=ocr_page_numbers)
    except OCRProviderError as error:
        log_event(
            logging.WARNING,
            "pdf ocr failed",
            **(log_fields or {}),
            ocr_provider=provider.name,
            error_code=error.code,
            ocr_candidate_page_count=len(ocr_page_numbers),
            ocr_candidate_page_numbers=ocr_page_numbers,
        )
        raise HTTPException(status_code=422, detail=error.to_detail()) from error

    log_event(
        logging.INFO,
        "pdf ocr completed",
        **(log_fields or {}),
        ocr_provider=provider.name,
        ocr_candidate_page_count=len(ocr_page_numbers),
        ocr_candidate_page_numbers=ocr_page_numbers,
        ocr_result_page_count=len(ocr_page_texts),
        ocr_non_empty_page_count=sum(
            1 for page in ocr_page_texts if (page.get("text") or "").strip()
        ),
    )

    ocr_page_text_by_page_no = {
        page["page_no"]: (page.get("text") or "").strip() for page in ocr_page_texts
    }
    merged_page_texts = [
        {
            "page_no": page["page_no"],
            "width": page.get("width"),
            "height": page.get("height"),
            "text": (
                ocr_page_text_by_page_no[page["page_no"]]
                if (
                    page["page_no"] in ocr_page_text_by_page_no
                    and ocr_page_text_by_page_no[page["page_no"]]
                )
                else (page.get("text") or "")
            ),
        }
        for page in page_texts
    ]

    ocr_result = build_document_from_page_texts(
        merged_page_texts,
        source_mode="ocr",
        ocr_provider=provider.name,
    )
    if ocr_result["parse_score_bp"] <= 0 or not ocr_result["blocks"]:
        log_event(
            logging.WARNING,
            "pdf parse failed",
            **(log_fields or {}),
            error_code="ocr_no_text",
            **summarize_document_result(ocr_result),
        )
        raise HTTPException(
            status_code=422,
            detail={
                "code": "ocr_no_text",
                "message": "OCR completed but no structured text was produced.",
                "ocr_provider": provider.name,
                "recoverable": True,
            },
        )

    log_event(
        logging.INFO,
        "pdf parse completed",
        **(log_fields or {}),
        **summarize_document_result(ocr_result),
    )
    return ocr_result


@app.get("/health")
def health():
    return {"ok": True}


def parse_document(request: ParseRequest):
    file_kind = infer_file_kind(request.storage_key, request.logical_path)
    data = get_object_bytes(request.storage_key)
    log_fields = {
        "document_version_id": request.document_version_id,
        "file_kind": file_kind,
        "library_id": request.library_id,
        "logical_path": request.logical_path,
        "storage_key": request.storage_key,
        "workspace_id": request.workspace_id,
    }

    if file_kind == "pdf":
        return parse_pdf_document(data, log_fields=log_fields)
    if file_kind == "docx":
        return parse_docx_document(data)
    if file_kind == "text":
        return parse_text_document(data)

    raise HTTPException(status_code=415, detail=f"Unsupported file type: {file_kind}")


@app.post("/parse")
def parse_document_route(request: ParseRequest, http_request: FastAPIRequest):
    init_tracing()
    request_context = propagate.extract({key: value for key, value in http_request.headers.items()})
    tracer = trace.get_tracer("anchordesk.parser")

    with tracer.start_as_current_span(
        "parser.parse",
        context=request_context,
        kind=SpanKind.SERVER,
        attributes={
            "document.version.id": request.document_version_id,
            "library.id": request.library_id or "",
            "workspace.id": request.workspace_id or "",
        },
    ):
        file_kind = infer_file_kind(request.storage_key, request.logical_path)
        log_event(
            logging.INFO,
            "parser request started",
            document_version_id=request.document_version_id,
            file_kind=file_kind,
            library_id=request.library_id,
            logical_path=request.logical_path,
            storage_key=request.storage_key,
            workspace_id=request.workspace_id,
        )
        result = parse_document(request)

        log_event(
            logging.INFO,
            "parser request completed",
            block_count=len(result.get("blocks", [])),
            document_version_id=request.document_version_id,
            file_kind=file_kind,
            page_count=result.get("page_count"),
            parse_score_bp=result.get("parse_score_bp"),
            source_mode=(result.get("source") or {}).get("mode"),
            ocr_provider=(result.get("source") or {}).get("ocr_provider"),
        )
        return result
