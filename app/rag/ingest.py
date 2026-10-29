"""DOCX ingestion shared by every retrieval path; run with python -m app.rag.ingest."""

import hashlib
import logging
import re
from pathlib import Path

from docx import Document as DocxDocument
from docx.table import Table
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


def detect_heading_level(text: str, style_name: str) -> int:
    style = style_name.lower()
    for level in (1, 2, 3):
        if style in (f"heading {level}", f"标题 {level}"):
            return level
    if re.match(r"^第[一二三四五六七八九十百0-9]+[部分章节篇]", text):
        return 1
    if re.match(r"^[一二三四五六七八九十]+[、\s]", text):
        return 1
    if re.match(r"^[（(][一二三四五六七八九十0-9]+[）)]", text):
        return 2
    if re.match(r"^\d+\.\d+\.\d+", text):
        return 3
    if re.match(r"^\d+\.\d+", text):
        return 2
    if re.match(r"^\d+[、.\s]", text):
        return 3
    return 0


def parse_docx_with_breadcrumbs(file_path: str | Path) -> list[Document]:
    path = Path(file_path)
    document = DocxDocument(path)
    sections: list[Document] = []
    headings = ["", "", ""]
    buffer: list[str] = []

    def flush() -> None:
        if not buffer:
            return
        breadcrumb = " > ".join(part for part in headings if part) or "常规说明"
        sections.append(
            Document(
                page_content=f"【业务层级：{breadcrumb}】\n" + "\n".join(buffer),
                metadata={"source": path.name, "breadcrumb": breadcrumb},
            )
        )
        buffer.clear()

    # Tables stay with the section in which they appear, instead of being
    # appended to the final heading after all paragraphs have been parsed.
    for block in document.iter_inner_content():
        if isinstance(block, Table):
            rows = [
                " | ".join(cell.text.strip() for cell in row.cells)
                for row in block.rows
                if any(cell.text.strip() for cell in row.cells)
            ]
            if rows:
                buffer.append("【表格数据】\n" + "\n".join(rows))
            continue
        text = block.text.strip()
        if not text:
            continue
        level = detect_heading_level(text, block.style.name if block.style else "")
        if level:
            flush()
            headings[level - 1] = text
            headings[level:] = [""] * (3 - level)
            # Preserve a heading even if no body follows it.
            buffer.append(text)
        else:
            buffer.append(text)
    flush()
    return RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=150).split_documents(
        sections
    )


def load_documents(docs_dir: Path) -> list[Document]:
    documents: list[Document] = []
    for path in sorted(docs_dir.glob("*.docx")):
        if not path.name.startswith("~$"):
            documents.extend(parse_docx_with_breadcrumbs(path))
    return documents


def sync_documents(vector_store, documents: list[Document]) -> int:
    """Upsert before pruning stale chunks for sources included in this run.

    No directory deletion. Files absent from this import retain their indexed
    data; deletion of an entire source is a separate administrative action.
    """
    by_source: dict[str, list[Document]] = {}
    for document in documents:
        by_source.setdefault(document.metadata["source"], []).append(document)
    for source, chunks in by_source.items():
        ids = [
            hashlib.sha256(f"{source}\0{index}\0{chunk.page_content}".encode("utf-8")).hexdigest()
            for index, chunk in enumerate(chunks)
        ]
        previous = vector_store.get(where={"source": source}, include=[])["ids"]
        vector_store.add_documents(chunks, ids=ids)
        stale = sorted(set(previous) - set(ids))
        if stale:
            vector_store.delete(ids=stale)
    return len(documents)


def ingest(settings: Settings | None = None) -> int:
    from app.rag.retriever import create_vector_store

    settings = settings or get_settings()
    documents = load_documents(settings.DOCS_DIR)
    if not documents:
        raise ValueError(f"没有可入库的 DOCX 内容：{settings.DOCS_DIR}")
    count = sync_documents(create_vector_store(settings), documents)
    logger.info("Indexed %d chunks", count)
    return count


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    ingest()
