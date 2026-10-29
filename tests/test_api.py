import asyncio

from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage
from langgraph.checkpoint.memory import InMemorySaver

from app.agent.graph import build_agent
from app.agent.service import ChatService
from app.agent.tools import create_search_tool
from app.core.config import Settings
from app.main import create_app
from app.schemas.chat import ChatRequest


def make_service(model):
    return ChatService(
        build_agent(model, [create_search_tool(lambda q: [])], checkpointer=InMemorySaver())
    )


def test_stream_suppresses_intermediate_model_text(model_factory):
    model = model_factory(
        AIMessage(
            content="不应输出的内部文本",
            tool_calls=[{"name": "search_knowledge_base", "args": {"query": "申报"}, "id": "one"}],
        ),
        AIMessage(content="最终答案"),
    )
    service = make_service(model)
    with TestClient(create_app(Settings(_env_file=None), service=service)) as client:
        assert client.get("/").status_code == 200
        response = client.post(
            "/api/v1/chat/stream", json={"message": "如何申报", "thread_id": "session-a"}
        )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "不应输出的内部文本" not in response.text
    for name in ("session", "intent", "tool_start", "tool_end", "message", "end"):
        assert f"event: {name}" in response.text
    assert "最终答案" in response.text
    assert response.text.count("[DONE]") == 1
    assert not service._sessions


def test_request_validation_and_generated_sessions(model_factory):
    assert ChatRequest(message="hi").thread_id != ChatRequest(message="hi").thread_id
    service = make_service(model_factory(AIMessage(content="hello")))
    with TestClient(create_app(Settings(_env_file=None), service=service)) as client:
        for body in (
            {"message": "  "},
            {"message": ""},
            {"message": "hi", "thread_id": ""},
            {"message": "hi", "thread_id": "../a"},
        ):
            assert client.post("/api/v1/chat/stream", json=body).status_code == 422
        response = client.post("/api/v1/chat/stream", json={"message": "hi"})
        assert "event: session" in response.text
        assert '"intent": "general_chat"' in response.text


class FailingGraph:
    async def astream_events(self, *args, **kwargs):
        raise RuntimeError("secret-error-detail")
        yield


class SlowGraph:
    async def astream_events(self, *args, **kwargs):
        await asyncio.sleep(1)
        yield {}


def test_stream_errors_are_sanitized():
    async def scenario():
        return [event async for event in ChatService(FailingGraph()).stream("hi", "a")]

    events = asyncio.run(scenario())
    assert events[-2]["data"]["code"] == "agent_error"
    assert events[-1]["event"] == "end"
    assert "secret-error-detail" not in str(events)


def test_timeout_releases_session_lock():
    service = ChatService(SlowGraph(), timeout=0.01)

    async def scenario():
        return [event async for event in service.stream("hi", "a")]

    events = asyncio.run(scenario())
    assert events[-2]["data"]["code"] == "timeout"
    assert not service._sessions


def test_cancellation_propagates_and_releases_session_lock():
    service = ChatService(SlowGraph())

    async def scenario():
        async def consume():
            return [event async for event in service.stream("hi", "a")]

        task = asyncio.create_task(consume())
        await asyncio.sleep(0.01)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            return True
        return False

    assert asyncio.run(scenario())
    assert not service._sessions


def test_same_session_serializes_but_different_sessions_can_overlap():
    class RecordingGraph:
        def __init__(self):
            self.active = set()
            self.max_active = 0

        async def astream_events(self, state, config, **kwargs):
            thread = config["configurable"]["thread_id"]
            assert thread not in self.active
            self.active.add(thread)
            self.max_active = max(self.max_active, len(self.active))
            try:
                await asyncio.sleep(0.02)
                yield {"event": "ignored"}
            finally:
                self.active.remove(thread)

    graph = RecordingGraph()
    service = ChatService(graph)

    async def scenario():
        async def consume(thread):
            return [event async for event in service.stream("hi", thread)]

        await asyncio.gather(consume("a"), consume("a"), consume("b"))

    asyncio.run(scenario())
    assert graph.max_active == 2
    assert not service._sessions
