import asyncio
from uuid import uuid4

import pytest

from app.core.config import get_settings
from app.core.runtime import create_chat_service

pytestmark = pytest.mark.integration


def test_agentic_rag():
    async def scenario():
        async with create_chat_service(get_settings()) as service:
            return [
                event
                async for event in service.stream(
                    "请检索知识库，概括企业所得税申报流程并说明资料来源。", uuid4().hex
                )
            ]

    events = asyncio.run(scenario())
    assert not any(event["event"] == "error" for event in events)
    assert any(event["event"] == "tool_start" for event in events)
    assert any(event["event"] == "message" and event["data"]["text"] for event in events)
