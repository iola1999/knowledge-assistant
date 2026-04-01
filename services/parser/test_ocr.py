import io
import unittest
from unittest.mock import patch

from pypdf import PdfWriter

from ocr import (
    DashScopeOCRProvider,
    OCRProviderError,
    extract_dashscope_page_text,
    get_ocr_provider,
)


class OCRProviderTestCase(unittest.TestCase):
    def test_get_ocr_provider_defaults_to_dashscope(self):
        with patch.dict("os.environ", {}, clear=True):
            provider = get_ocr_provider()

        self.assertEqual(provider.name, "dashscope")

    def test_extract_dashscope_page_text_prefers_words_info(self):
        payload = {
            "output": {
                "choices": [
                    {
                        "message": {
                            "content": [
                                {
                                    "ocr_result": {
                                        "words_info": [
                                            {"text": "第一行"},
                                            {"text": "第二行"},
                                        ]
                                    },
                                    "text": "这段 text 不应该被优先使用",
                                }
                            ]
                        }
                    }
                ]
            }
        }

        self.assertEqual(extract_dashscope_page_text(payload), "第一行\n第二行")

    def test_dashscope_provider_requires_a_real_api_key(self):
        writer = PdfWriter()
        writer.add_blank_page(width=300, height=300)
        buffer = io.BytesIO()
        writer.write(buffer)

        with patch.dict(
            "os.environ",
            {
                "PARSER_OCR_PROVIDER": "dashscope",
                "PARSER_OCR_DASHSCOPE_API_KEY": "",
                "DASHSCOPE_API_KEY": "",
            },
            clear=False,
        ):
            provider = DashScopeOCRProvider()
            with self.assertRaises(OCRProviderError) as context:
                provider.extract_pdf_pages(buffer.getvalue())

        self.assertEqual(context.exception.code, "ocr_provider_not_configured")
        self.assertEqual(context.exception.provider_name, "dashscope")

    def test_dashscope_provider_only_ocrs_eligible_pages(self):
        provider = DashScopeOCRProvider(
            api_key="sk-test",
            api_url="https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
            model="qwen-vl-ocr-latest",
            task="advanced_recognition",
        )

        with patch(
            "ocr.render_pdf_pages_for_ocr",
            return_value=[
                {
                    "page_no": 1,
                    "width": 612.0,
                    "height": 792.0,
                    "ocr_eligible": True,
                    "mime_type": "image/png",
                    "image_bytes": b"page-1-bytes",
                },
                {
                    "page_no": 2,
                    "width": 612.0,
                    "height": 792.0,
                    "ocr_eligible": False,
                    "mime_type": None,
                    "image_bytes": None,
                },
            ],
        ) as render_pdf_pages, patch(
            "ocr.call_dashscope_ocr_api",
            return_value={
                "output": {
                    "choices": [
                        {
                            "message": {
                                "content": [
                                    {
                                        "ocr_result": {
                                            "words_info": [
                                                {"text": "第一页第一行"},
                                                {"text": "第一页第二行"},
                                            ]
                                        }
                                    }
                                ]
                            }
                        }
                    ]
                }
            },
        ) as call_api:
            page_texts = provider.extract_pdf_pages(b"%PDF-mock%", page_numbers=[1, 2])

        render_pdf_pages.assert_called_once_with(b"%PDF-mock%", page_numbers=[1, 2])
        self.assertEqual(call_api.call_count, 1)
        self.assertEqual(
            page_texts,
            [
                {
                    "page_no": 1,
                    "width": 612.0,
                    "height": 792.0,
                    "text": "第一页第一行\n第一页第二行",
                },
                {
                    "page_no": 2,
                    "width": 612.0,
                    "height": 792.0,
                    "text": "",
                },
            ],
        )

    def test_dashscope_provider_reads_task_from_env(self):
        with patch.dict(
            "os.environ",
            {
                "PARSER_OCR_PROVIDER": "dashscope",
                "PARSER_OCR_DASHSCOPE_API_KEY": "sk-test",
                "PARSER_OCR_DASHSCOPE_TASK": "multi_lan",
            },
            clear=False,
        ):
            provider = DashScopeOCRProvider()

        self.assertEqual(provider.task, "multi_lan")


if __name__ == "__main__":
    unittest.main()
