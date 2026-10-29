import json
from collections.abc import Callable

from langchain_core.documents import Document
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field, field_validator


class SearchInput(BaseModel):
    query: str = Field(min_length=1, max_length=2000, description="完整、具体的知识库检索问题")

    @field_validator("query")
    @classmethod
    def strip_query(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("query must not be blank")
        return value.strip()


def create_search_tool(search: Callable[[str], list[Document]]) -> StructuredTool:
    """Keep the synchronous retriever in ToolNode's worker thread."""

    def search_knowledge_base(query: str) -> str:
        documents = search(query)
        return json.dumps(
            {
                "documents": [
                    {
                        "content": document.page_content,
                        "source": document.metadata.get("source", "未知来源"),
                        "breadcrumb": document.metadata.get("breadcrumb", ""),
                    }
                    for document in documents
                ],
                "found": bool(documents),
            },
            ensure_ascii=False,
        )

    return StructuredTool.from_function(
        func=search_knowledge_base,
        name="search_knowledge_base",
        description="检索企业财税私有知识库，返回相关片段和来源。结果不足时可改写 query 再次调用。",
        args_schema=SearchInput,
    )
