"""Transport-independent event adapter and per-session execution serialization."""

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.graph.state import CompiledStateGraph

logger = logging.getLogger(__name__)


class ChatService:
    def __init__(self, graph: CompiledStateGraph, *, max_iterations: int = 4, timeout: float = 180):
        self.graph = graph
        self.recursion_limit = 2 * max_iterations + 6
        self.timeout = timeout
        self._sessions: dict[str, tuple[asyncio.Lock, int]] = {}

    @asynccontextmanager
    async def _session(self, thread_id: str):
        # Includes waiters in the refcount so a completed request cannot remove
        # a lock while another request for the same session is queued.
        lock, count = self._sessions.get(thread_id, (asyncio.Lock(), 0))
        self._sessions[thread_id] = (lock, count + 1)
        try:
            async with lock:
                yield
        finally:
            _, count = self._sessions[thread_id]
            if count == 1:
                del self._sessions[thread_id]
            else:
                self._sessions[thread_id] = (lock, count - 1)

    async def stream(self, message: str, thread_id: str) -> AsyncIterator[dict]:
        yield {"event": "session", "data": {"thread_id": thread_id}}
        intent_sent = False
        try:
            async with asyncio.timeout(self.timeout), self._session(thread_id):
                config = {
                    "configurable": {"thread_id": thread_id},
                    "recursion_limit": self.recursion_limit,
                }
                async for event in self.graph.astream_events(
                    {"messages": [HumanMessage(content=message)]},
                    config=config,
                    version="v2",
                ):
                    kind = event["event"]
                    name = event.get("name")
                    if kind == "on_tool_start":
                        if name == "search_knowledge_base" and not intent_sent:
                            yield {"event": "intent", "data": {"intent": "rag_search"}}
                            intent_sent = True
                        yield {
                            "event": "tool_start",
                            "data": {"name": name, "run_id": str(event["run_id"])},
                        }
                    elif kind == "on_tool_end":
                        result = event["data"].get("output")
                        yield {
                            "event": "tool_end",
                            "data": {
                                "name": name,
                                "run_id": str(event["run_id"]),
                                "status": getattr(result, "status", "success"),
                            },
                        }
                    elif kind == "on_tool_error":
                        yield {
                            "event": "tool_end",
                            "data": {
                                "name": name,
                                "run_id": str(event["run_id"]),
                                "status": "error",
                            },
                        }
                    elif kind == "on_chain_end" and name in ("agent", "limit"):
                        output = event["data"].get("output")
                        if not isinstance(output, dict):
                            continue
                        messages = output.get("messages", [])
                        if not messages:
                            continue
                        final = messages[-1]
                        if isinstance(final, AIMessage) and not final.tool_calls:
                            if not intent_sent:
                                yield {"event": "intent", "data": {"intent": "general_chat"}}
                                intent_sent = True
                            # Do not forward raw model deltas: a turn can contain
                            # text followed by tool calls. Only publish a final answer.
                            yield {"event": "message", "data": {"text": final.text}}
        except TimeoutError:
            yield {
                "event": "error",
                "data": {"code": "timeout", "message": "处理超时，请稍后重试。"},
            }
        except Exception as error:
            logger.warning("Chat failed: %s", type(error).__name__)
            yield {
                "event": "error",
                "data": {"code": "agent_error", "message": "服务暂时不可用，请稍后重试。"},
            }
        yield {"event": "end", "data": "[DONE]"}
