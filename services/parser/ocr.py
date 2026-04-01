from __future__ import annotations

import base64
import io
import json
import os
from typing import Protocol
from urllib import error as urllib_error
from urllib import request as urllib_request

import pypdfium2
from PIL import Image
from pypdf import PdfReader

DEFAULT_DASHSCOPE_OCR_API_URL = (
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
)
DEFAULT_DASHSCOPE_OCR_MODEL = "qwen-vl-ocr-latest"
DEFAULT_DASHSCOPE_OCR_TASK = "advanced_recognition"
DEFAULT_DASHSCOPE_MIN_PIXELS = 32 * 32 * 3
DEFAULT_DASHSCOPE_MAX_PIXELS = 32 * 32 * 8192
DEFAULT_PDF_RENDER_DPI = 200


class OCRProviderError(Exception):
    def __init__(self, *, code: str, message: str, provider_name: str):
        super().__init__(message)
        self.code = code
        self.message = message
        self.provider_name = provider_name

    def to_detail(self) -> dict:
        return {
            "code": self.code,
            "message": self.message,
            "ocr_provider": self.provider_name,
            "recoverable": True,
        }


class OCRProvider(Protocol):
    name: str

    def extract_pdf_pages(
        self,
        pdf_bytes: bytes,
        *,
        page_numbers: list[int] | None = None,
    ) -> list[dict]:
        pass


def is_placeholder_secret(value: str | None) -> bool:
    normalized = (value or "").strip().lower()
    return normalized.startswith("example-")


def read_configured_env(*names: str) -> str | None:
    for name in names:
        value = os.getenv(name)
        if value and value.strip():
            return value.strip()
    return None


def build_data_url(mime_type: str, data: bytes) -> str:
    encoded = base64.b64encode(data).decode("utf-8")
    return f"data:{mime_type};base64,{encoded}"


def strip_markdown_code_fence(text: str) -> str:
    stripped = (text or "").strip()
    if not stripped.startswith("```") or not stripped.endswith("```"):
        return stripped

    lines = stripped.splitlines()
    if len(lines) < 2:
        return stripped

    return "\n".join(lines[1:-1]).strip()


def extract_dashscope_page_text(payload: dict) -> str:
    content = (
        payload.get("output", {})
        .get("choices", [{}])[0]
        .get("message", {})
        .get("content", [{}])[0]
    )

    ocr_result = content.get("ocr_result") if isinstance(content, dict) else None
    words_info = ocr_result.get("words_info") if isinstance(ocr_result, dict) else None
    if isinstance(words_info, list):
        lines = [
            str(item.get("text", "")).strip()
            for item in words_info
            if isinstance(item, dict) and str(item.get("text", "")).strip()
        ]
        if lines:
            return "\n".join(lines)

    text = content.get("text") if isinstance(content, dict) else None
    if isinstance(text, str) and text.strip():
        return strip_markdown_code_fence(text)

    raise OCRProviderError(
        code="ocr_no_text",
        message="DashScope OCR response did not contain any text output.",
        provider_name="dashscope",
    )


def encode_pil_image_for_ocr(image: Image.Image) -> tuple[str, bytes]:
    rgb_image = image.convert("RGB")
    buffer = io.BytesIO()
    rgb_image.save(buffer, format="JPEG", quality=88, optimize=True)
    return "image/jpeg", buffer.getvalue()


def render_pdf_pages_for_ocr(
    pdf_bytes: bytes,
    *,
    page_numbers: list[int] | None = None,
) -> list[dict]:
    requested_page_numbers = set(page_numbers or [])
    reader = PdfReader(io.BytesIO(pdf_bytes))
    pdf = pypdfium2.PdfDocument(pdf_bytes)
    page_renders: list[dict] = []

    try:
        for page_index in range(len(pdf)):
            page_no = page_index + 1
            reader_page = reader.pages[page_index]
            width = float(reader_page.mediabox.width) if reader_page.mediabox else None
            height = float(reader_page.mediabox.height) if reader_page.mediabox else None
            should_consider_page = not requested_page_numbers or page_no in requested_page_numbers
            has_image = should_consider_page and len(reader_page.images) > 0

            if not should_consider_page or not has_image:
                page_renders.append(
                    {
                        "page_no": page_no,
                        "width": width,
                        "height": height,
                        "ocr_eligible": False,
                        "mime_type": None,
                        "image_bytes": None,
                    }
                )
                continue

            page = pdf[page_index]
            try:
                bitmap = page.render(
                    scale=DEFAULT_PDF_RENDER_DPI / 72,
                    rev_byteorder=True,
                    prefer_bgrx=True,
                )
                image = bitmap.to_pil()
                mime_type, image_bytes = encode_pil_image_for_ocr(image)
            finally:
                page.close()

            page_renders.append(
                {
                    "page_no": page_no,
                    "width": width,
                    "height": height,
                    "ocr_eligible": True,
                    "mime_type": mime_type,
                    "image_bytes": image_bytes,
                }
            )
    finally:
        pdf.close()

    return page_renders


def extract_dashscope_error_message(response_text: str, status_code: int) -> str:
    message = f"DashScope OCR request failed with HTTP {status_code}."
    stripped = response_text.strip()
    if not stripped:
        return message

    try:
        payload = json.loads(stripped)
    except json.JSONDecodeError:
        return f"{message} {stripped}"

    if isinstance(payload, dict):
        error_message = payload.get("message")
        if isinstance(error_message, str) and error_message.strip():
            return f"{message} {error_message.strip()}"

        error_code = payload.get("code")
        if isinstance(error_code, str) and error_code.strip():
            return f"{message} {error_code.strip()}"

    return f"{message} {stripped}"


def call_dashscope_ocr_api(
    *,
    api_url: str,
    api_key: str,
    model: str,
    task: str,
    mime_type: str,
    image_bytes: bytes,
) -> dict:
    payload = {
        "model": model,
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "image": build_data_url(mime_type, image_bytes),
                            "min_pixels": DEFAULT_DASHSCOPE_MIN_PIXELS,
                            "max_pixels": DEFAULT_DASHSCOPE_MAX_PIXELS,
                            "enable_rotate": True,
                        }
                    ],
                }
            ]
        },
        "parameters": {
            "ocr_options": {
                "task": task,
            }
        },
    }

    request = urllib_request.Request(
        api_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib_request.urlopen(request, timeout=120) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib_error.HTTPError as error:
        response_text = error.read().decode("utf-8", errors="ignore")
        raise OCRProviderError(
            code="ocr_request_failed",
            message=extract_dashscope_error_message(response_text, error.code),
            provider_name="dashscope",
        ) from error
    except urllib_error.URLError as error:
        raise OCRProviderError(
            code="ocr_request_failed",
            message=f"DashScope OCR request failed: {error.reason}.",
            provider_name="dashscope",
        ) from error


class DisabledOCRProvider:
    name = "disabled"

    def extract_pdf_pages(
        self,
        pdf_bytes: bytes,
        *,
        page_numbers: list[int] | None = None,
    ) -> list[dict]:
        raise OCRProviderError(
            code="ocr_required",
            message="No extractable PDF text found and OCR provider is disabled.",
            provider_name=self.name,
        )


class MockOCRProvider:
    name = "mock"

    def extract_pdf_pages(
        self,
        pdf_bytes: bytes,
        *,
        page_numbers: list[int] | None = None,
    ) -> list[dict]:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        mock_text = (os.getenv("PARSER_OCR_MOCK_TEXT") or "").strip()
        if not mock_text:
            raise OCRProviderError(
                code="ocr_no_text",
                message="Mock OCR provider returned empty text.",
                provider_name=self.name,
            )

        pages: list[dict] = []
        requested_page_numbers = set(page_numbers or [])
        for page_index, page in enumerate(reader.pages, start=1):
            if requested_page_numbers and page_index not in requested_page_numbers:
                continue
            width = float(page.mediabox.width) if page.mediabox else None
            height = float(page.mediabox.height) if page.mediabox else None
            pages.append(
                {
                    "page_no": page_index,
                    "width": width,
                    "height": height,
                    "text": mock_text,
                }
            )

        return pages


class DashScopeOCRProvider:
    name = "dashscope"

    def __init__(
        self,
        *,
        api_key: str | None = None,
        api_url: str | None = None,
        model: str | None = None,
        task: str | None = None,
    ):
        self.api_key = api_key or read_configured_env(
            "PARSER_OCR_DASHSCOPE_API_KEY",
            "DASHSCOPE_API_KEY",
        )
        self.api_url = (
            api_url
            or read_configured_env("PARSER_OCR_DASHSCOPE_API_URL")
            or DEFAULT_DASHSCOPE_OCR_API_URL
        )
        self.model = (
            model
            or read_configured_env("PARSER_OCR_DASHSCOPE_MODEL")
            or DEFAULT_DASHSCOPE_OCR_MODEL
        )
        self.task = (
            task
            or read_configured_env("PARSER_OCR_DASHSCOPE_TASK")
            or DEFAULT_DASHSCOPE_OCR_TASK
        )

    def ensure_configured(self) -> None:
        if not self.api_key or is_placeholder_secret(self.api_key):
            raise OCRProviderError(
                code="ocr_provider_not_configured",
                message="DashScope OCR provider is not configured. Set PARSER_OCR_DASHSCOPE_API_KEY or DASHSCOPE_API_KEY.",
                provider_name=self.name,
            )

    def extract_pdf_pages(
        self,
        pdf_bytes: bytes,
        *,
        page_numbers: list[int] | None = None,
    ) -> list[dict]:
        self.ensure_configured()
        page_renders = render_pdf_pages_for_ocr(pdf_bytes, page_numbers=page_numbers)
        if not page_renders:
            raise OCRProviderError(
                code="ocr_render_failed",
                message="Failed to render PDF pages for OCR.",
                provider_name=self.name,
            )

        page_texts: list[dict] = []
        for page in page_renders:
            if not page["ocr_eligible"]:
                page_texts.append(
                    {
                        "page_no": page["page_no"],
                        "width": page["width"],
                        "height": page["height"],
                        "text": "",
                    }
                )
                continue

            payload = call_dashscope_ocr_api(
                api_url=self.api_url,
                api_key=self.api_key,
                model=self.model,
                task=self.task,
                mime_type=page["mime_type"],
                image_bytes=page["image_bytes"],
            )
            page_texts.append(
                {
                    "page_no": page["page_no"],
                    "width": page["width"],
                    "height": page["height"],
                    "text": extract_dashscope_page_text(payload),
                }
            )

        return page_texts


def get_ocr_provider() -> OCRProvider:
    provider_name = (os.getenv("PARSER_OCR_PROVIDER") or "dashscope").strip().lower()

    if provider_name in {"", "disabled", "none"}:
        return DisabledOCRProvider()
    if provider_name == "mock":
        return MockOCRProvider()
    if provider_name == "dashscope":
        return DashScopeOCRProvider()

    raise RuntimeError(f"Unsupported OCR provider: {provider_name}")
