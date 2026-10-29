from unittest.mock import Mock

from docx import Document as DocxDocument
from langchain_core.documents import Document

from app.rag.ingest import load_documents, parse_docx_with_breadcrumbs, sync_documents
from app.rag.retriever import HybridRerankRetriever, tokenize


def test_tables_keep_their_section_and_source(tmp_path):
    path = tmp_path / "指南.docx"
    doc = DocxDocument()
    doc.add_heading("第一章 登记", level=1)
    doc.add_paragraph("登记步骤")
    table = doc.add_table(rows=1, cols=2)
    table.cell(0, 0).text = "材料"
    table.cell(0, 1).text = "营业执照"
    doc.add_heading("第二章 申报", level=1)
    doc.add_paragraph("申报步骤")
    doc.save(path)
    chunks = parse_docx_with_breadcrumbs(path)
    containing_table = next(chunk for chunk in chunks if "营业执照" in chunk.page_content)
    assert containing_table.metadata == {"source": "指南.docx", "breadcrumb": "第一章 登记"}
    assert all(
        "营业执照" not in chunk.page_content
        for chunk in chunks
        if chunk.metadata["breadcrumb"] == "第二章 申报"
    )
    assert len(load_documents(tmp_path)) == len(chunks)


def test_empty_document_has_no_chunks(tmp_path):
    path = tmp_path / "empty.docx"
    DocxDocument().save(path)
    assert parse_docx_with_breadcrumbs(path) == []


def test_hybrid_search_preserves_distinct_sources_and_reranks():
    a = Document(page_content="相同内容", metadata={"source": "a.docx"})
    b = Document(page_content="相同内容", metadata={"source": "b.docx"})
    store = Mock()
    store.as_retriever.return_value.invoke.return_value = [a]
    reranker = Mock()
    reranker.predict.return_value = [0.1, 0.9]
    retriever = HybridRerankRetriever(store, [a, b], reranker)
    assert retriever.search("内容", top_n=1) == [b]


def test_empty_bm25_corpus_and_empty_results():
    store = Mock()
    store.as_retriever.return_value.invoke.return_value = []
    reranker = Mock()
    retriever = HybridRerankRetriever(store, [], reranker)
    assert retriever.search("不存在") == []
    reranker.predict.assert_not_called()
    assert tokenize("企业所得税 ABC123") == ["企", "业", "所", "得", "税", "abc123"]


def test_reingestion_is_idempotent():
    store = Mock()
    store.get.return_value = {"ids": ["stale"]}
    docs = [Document(page_content="内容", metadata={"source": "a.docx"})]
    assert sync_documents(store, docs) == 1
    first_ids = store.add_documents.call_args.kwargs["ids"]
    store.delete.assert_called_once_with(ids=["stale"])
    store.get.return_value = {"ids": first_ids}
    store.reset_mock()
    sync_documents(store, docs)
    assert store.add_documents.call_args.kwargs["ids"] == first_ids
    store.delete.assert_not_called()


def test_failed_upsert_never_deletes_existing_chunks():
    import pytest

    store = Mock()
    store.get.return_value = {"ids": ["previous"]}
    store.add_documents.side_effect = RuntimeError("write failed")
    with pytest.raises(RuntimeError):
        sync_documents(store, [Document(page_content="new", metadata={"source": "a.docx"})])
    store.delete.assert_not_called()
