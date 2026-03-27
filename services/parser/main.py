from fastapi import FastAPI
from pydantic import BaseModel


class ParseRequest(BaseModel):
    workspace_id: str
    document_version_id: str
    storage_key: str
    sha256: str
    title: str | None = None
    logical_path: str | None = None


app = FastAPI(title="law-doc-parser")


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/parse")
def parse_document(request: ParseRequest):
    title = request.title or request.storage_key
    text = f"Imported document placeholder for {title}. Replace parser service with Docling/OCR pipeline."

    return {
        "page_count": 1,
        "parse_score_bp": 1000,
        "pages": [
            {
                "page_no": 1,
                "width": 1000,
                "height": 1400,
                "text_length": len(text),
            }
        ],
        "blocks": [
            {
                "page_no": 1,
                "order_index": 1,
                "block_type": "paragraph",
                "section_label": "Imported",
                "heading_path": ["Imported"],
                "text": text,
                "bbox_json": {
                    "x1": 0.1,
                    "y1": 0.1,
                    "x2": 0.9,
                    "y2": 0.2,
                },
            }
        ],
    }
