"""Lazy hybrid retrieval over the same persisted chunks used for dense search."""

import re
from functools import lru_cache
from threading import Lock

from langchain_core.documents import Document

from app.core.config import Settings, get_settings


def tokenize(text: str) -> list[str]:
    """Chinese characters and ASCII words work without a tokenizer download."""
    return re.findall(r"[\u4e00-\u9fff]|[a-z0-9_]+", text.lower())


def create_vector_store(settings: Settings):
    # Importing the API or graph must not initialize torch/transformers/Chroma.
    from langchain_chroma import Chroma
    from langchain_huggingface import HuggingFaceEmbeddings

    embedding = HuggingFaceEmbeddings(
        model_name=settings.EMBEDDING_MODEL,
        model_kwargs={"device": settings.EMBEDDING_DEVICE},
        encode_kwargs={"normalize_embeddings": True},
    )
    return Chroma(
        collection_name=settings.CHROMA_COLLECTION,
        persist_directory=str(settings.PERSIST_DB_DIR),
        embedding_function=embedding,
    )


class HybridRerankRetriever:
    def __init__(self, vector_store, docs: list[Document], reranker, top_k: int = 10):
        from rank_bm25 import BM25Okapi

        self.vector_store = vector_store
        self.vector_retriever = vector_store.as_retriever(search_kwargs={"k": top_k})
        self._docs = docs
        self._top_k = top_k
        self._bm25 = None
        if docs and any(tokenize(doc.page_content) for doc in docs):
            self._bm25 = BM25Okapi([tokenize(doc.page_content) for doc in docs])
        self.reranker = reranker

    def hybrid_search(self, query: str) -> list[Document]:
        dense_docs = self.vector_retriever.invoke(query)
        sparse_docs = (
            self._bm25.get_top_n(tokenize(query), self._docs, n=self._top_k)
            if self._bm25 is not None
            else []
        )
        unique = {}
        for doc in dense_docs + sparse_docs:
            key = (
                doc.metadata.get("source", ""),
                doc.metadata.get("breadcrumb", ""),
                doc.page_content,
            )
            unique.setdefault(key, doc)
        return list(unique.values())

    def rerank(self, query: str, docs: list[Document], top_n: int = 3) -> list[Document]:
        if top_n < 1:
            raise ValueError("top_n must be positive")
        if not docs:
            return []
        scores = self.reranker.predict([(query, doc.page_content) for doc in docs])
        ranked = sorted(zip(docs, scores, strict=True), key=lambda pair: pair[1], reverse=True)
        return [doc for doc, _ in ranked[:top_n]]

    def search(self, query: str, top_n: int = 3) -> list[Document]:
        if not query.strip():
            return []
        return self.rerank(query, self.hybrid_search(query), top_n)


def create_retriever(settings: Settings) -> HybridRerankRetriever:
    from sentence_transformers import CrossEncoder

    store = create_vector_store(settings)
    stored = store.get(include=["documents", "metadatas"])
    docs = [
        Document(page_content=content, metadata=metadata or {})
        for content, metadata in zip(stored["documents"], stored["metadatas"], strict=True)
        if content and content.strip()
    ]
    return HybridRerankRetriever(
        store,
        docs,
        CrossEncoder(settings.RERANKER_MODEL, device=settings.EMBEDDING_DEVICE),
        top_k=settings.RETRIEVAL_TOP_K,
    )


class KnowledgeBase:
    """One lazy retriever per application; serialize CPU model initialization/use."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self._retriever: HybridRerankRetriever | None = None
        self._lock = Lock()

    def search(self, query: str) -> list[Document]:
        with self._lock:
            if self._retriever is None:
                self._retriever = create_retriever(self.settings)
            return self._retriever.search(query, top_n=self.settings.RETRIEVAL_TOP_N)


def get_hybrid_reranked_docs(query: str, top_n: int = 3) -> list[str]:
    """Compatibility helper for scripts; app code injects KnowledgeBase.search."""
    return [doc.page_content for doc in _default_retriever().search(query, top_n)]


@lru_cache
def _default_retriever() -> HybridRerankRetriever:
    return create_retriever(get_settings())
