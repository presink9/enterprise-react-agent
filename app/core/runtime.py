"""Application-scoped resource ownership for API and integration tests."""

from contextlib import asynccontextmanager

from langgraph.checkpoint.memory import InMemorySaver

from app.agent.graph import build_agent
from app.agent.service import ChatService
from app.agent.tools import create_search_tool
from app.core.config import Settings
from app.core.llm import create_llm
from app.rag.retriever import KnowledgeBase


@asynccontextmanager
async def checkpoint_store(settings: Settings):
    if settings.CHECKPOINT_BACKEND == "memory":
        yield InMemorySaver()
        return

    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
    from psycopg.rows import dict_row
    from psycopg_pool import AsyncConnectionPool

    async with AsyncConnectionPool(
        conninfo=settings.DB_URI,
        max_size=settings.POSTGRES_POOL_SIZE,
        min_size=1,
        open=False,
        kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row},
    ) as pool:
        await pool.wait(timeout=30)
        saver = AsyncPostgresSaver(pool)
        await saver.setup()
        yield saver


@asynccontextmanager
async def create_chat_service(settings: Settings):
    model = create_llm(settings)
    knowledge_base = KnowledgeBase(settings)
    try:
        async with checkpoint_store(settings) as saver:
            graph = build_agent(
                model,
                [create_search_tool(knowledge_base.search)],
                checkpointer=saver,
                max_iterations=settings.AGENT_MAX_ITERATIONS,
            )
            yield ChatService(
                graph,
                max_iterations=settings.AGENT_MAX_ITERATIONS,
                timeout=settings.CHAT_TIMEOUT,
            )
    finally:
        try:
            await model.root_async_client.close()
        finally:
            model.root_client.close()
