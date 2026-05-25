"""
Extract plain text from uploaded file bytes.

Supported MIME types / extensions:
    application/pdf          → pypdf
    application/vnd.openxmlformats-officedocument.wordprocessingml.document
                             → python-docx
    text/plain               → UTF-8 / latin-1 decode

Returns a single string with whitespace normalised but paragraph breaks
preserved (double newlines between logical sections).
"""

from __future__ import annotations

import io

SUPPORTED_CONTENT_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
}

EXTENSION_TO_CONTENT_TYPE: dict[str, str] = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
}


def content_type_from_filename(filename: str) -> str | None:
    suffix = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return EXTENSION_TO_CONTENT_TYPE.get(suffix)


def parse(file_bytes: bytes, content_type: str) -> str:
    """
    Parse *file_bytes* according to *content_type* and return clean text.
    Raises ValueError for unsupported types or unreadable files.
    """
    ct = content_type.split(";")[0].strip().lower()

    if ct == "application/pdf":
        return _parse_pdf(file_bytes)
    elif ct == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return _parse_docx(file_bytes)
    elif ct == "text/plain":
        return _parse_txt(file_bytes)
    else:
        raise ValueError(f"Unsupported content type: {content_type!r}")


# ---------------------------------------------------------------------------
# Format-specific parsers
# ---------------------------------------------------------------------------


def _parse_pdf(data: bytes) -> str:
    try:
        import pypdf  # lazy import keeps startup fast if PDF unused
    except ImportError as exc:
        raise RuntimeError("pypdf is required for PDF parsing") from exc

    reader = pypdf.PdfReader(io.BytesIO(data))
    pages: list[str] = []
    for page in reader.pages:
        text = page.extract_text() or ""
        text = text.strip()
        if text:
            pages.append(text)

    if not pages:
        raise ValueError("PDF contains no extractable text (may be image-only).")

    return "\n\n".join(pages)


def _parse_docx(data: bytes) -> str:
    try:
        import docx  # python-docx
    except ImportError as exc:
        raise RuntimeError("python-docx is required for DOCX parsing") from exc

    document = docx.Document(io.BytesIO(data))
    paragraphs = [p.text.strip() for p in document.paragraphs if p.text.strip()]

    if not paragraphs:
        raise ValueError("DOCX contains no extractable text.")

    return "\n\n".join(paragraphs)


def _parse_txt(data: bytes) -> str:
    for encoding in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            text = data.decode(encoding).strip()
            if text:
                return text
        except (UnicodeDecodeError, ValueError):
            continue

    raise ValueError("Could not decode text file with utf-8 or latin-1.")
