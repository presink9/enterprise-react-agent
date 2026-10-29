import asyncio
from uuid import uuid4

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from app.agent.graph import build_agent
from app.core.config import Settings
from app.core.runtime import checkpoint_store

pytestmark = pytest.mark.integration


def test_pg_persistence_across_reconnect(model_factory):
    async def scenario():
        settings = Settings(CHECKPOINT_BACKEND="postgres")
        config = {"configurable": {"thread_id": "test-" + uuid4().hex}}
        async with checkpoint_store(settings) as saver:
            graph = build_agent(model_factory(AIMessage(content="已记住")), [], checkpointer=saver)
            await graph.ainvoke({"messages": [HumanMessage(content="我的名字是李四")]}, config)
        async with checkpoint_store(settings) as saver:
            try:
                graph = build_agent(
                    model_factory(AIMessage(content="李四")), [], checkpointer=saver
                )
                state = await graph.aget_state(config)
                assert state.values["messages"][0].content == "我的名字是李四"
            finally:
                await saver.adelete_thread(config["configurable"]["thread_id"])

    asyncio.run(scenario())
