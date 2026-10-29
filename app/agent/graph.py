"""Dependency-injected ReAct graph: reason -> tools -> observe/reason."""

import logging
from collections.abc import Sequence

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, RemoveMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import BaseTool
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import REMOVE_ALL_MESSAGES
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import ToolNode

from app.agent.prompts import SYSTEM_PROMPT
from app.agent.state import AgentState

logger = logging.getLogger(__name__)


def tool_error(error: Exception) -> str:
    # Exception details can contain credentials or local paths.
    logger.warning("Tool execution failed: %s", type(error).__name__)
    return "工具调用失败，请检查参数或尝试其他查询；若仍失败，请向用户说明无法获取资料。"


def build_agent(
    model: BaseChatModel,
    tools: Sequence[BaseTool],
    *,
    checkpointer: BaseCheckpointSaver | None = None,
    max_iterations: int = 4,
) -> CompiledStateGraph:
    """Compile without connecting to a database or loading retrieval models.

    max_iterations bounds tool rounds, with one final model call to use the
    last observation. Further calls receive matching ToolMessages before a
    deterministic stop, keeping persisted message history valid.
    """
    if max_iterations < 1:
        raise ValueError("max_iterations must be positive")
    model_with_tools = model.bind_tools(list(tools)) if tools else model
    tool_node = ToolNode(list(tools), handle_tool_errors=tool_error)

    def prepare(state: AgentState) -> dict:
        # A disconnected/timed-out request may have checkpointed an AI tool
        # call before its observation. Close those calls before the new turn.
        messages = []
        pending = {}
        repaired = False

        def close_pending():
            nonlocal repaired
            for call in pending.values():
                messages.append(
                    ToolMessage(
                        content="上轮执行已中断，未取得此工具的结果。需要时请重新调用。",
                        tool_call_id=call["id"],
                        name=call["name"],
                        status="error",
                    )
                )
                repaired = True
            pending.clear()

        for message in state["messages"]:
            if isinstance(message, ToolMessage):
                pending.pop(message.tool_call_id, None)
            else:
                close_pending()
            messages.append(message)
            if isinstance(message, AIMessage):
                pending.update({call["id"]: call for call in message.tool_calls})
        close_pending()
        result = {"iterations": 0, "intent": "general_chat"}
        if repaired:
            result["messages"] = [RemoveMessage(id=REMOVE_ALL_MESSAGES), *messages]
        return result

    async def reason(state: AgentState, config: RunnableConfig) -> dict:
        response = await model_with_tools.ainvoke(
            [SystemMessage(content=SYSTEM_PROMPT), *state["messages"]], config
        )
        if not isinstance(response, AIMessage):
            raise TypeError("The chat model must return an AIMessage")
        if response.invalid_tool_calls:
            raise ValueError("The chat model returned malformed tool calls")
        return {"messages": [response]}

    def route(state: AgentState) -> str:
        if not state["messages"][-1].tool_calls:
            return END
        return "limit" if state["iterations"] >= max_iterations else "tools"

    async def act(state: AgentState, config: RunnableConfig) -> dict:
        result = await tool_node.ainvoke(state, config)
        is_search = any(
            call["name"] == "search_knowledge_base" for call in state["messages"][-1].tool_calls
        )
        return {
            "messages": result["messages"],
            "iterations": state["iterations"] + 1,
            "intent": "rag_search" if is_search else state["intent"],
        }

    def stop(state: AgentState) -> dict:
        observations = [
            ToolMessage(
                content="已达到本轮工具调用上限，此调用未执行。",
                tool_call_id=call["id"],
                name=call["name"],
                status="error",
            )
            for call in state["messages"][-1].tool_calls
        ]
        return {
            "messages": [
                *observations,
                AIMessage(
                    content="已达到本轮检索上限，现有资料仍不足以可靠回答。"
                    "请补充或缩小问题范围后重试。"
                ),
            ]
        }

    graph = StateGraph(AgentState)
    graph.add_node("prepare", prepare)
    graph.add_node("agent", reason)
    graph.add_node("tools", act)
    graph.add_node("limit", stop)
    graph.add_edge(START, "prepare")
    graph.add_edge("prepare", "agent")
    graph.add_conditional_edges("agent", route, ["tools", "limit", END])
    graph.add_edge("tools", "agent")
    graph.add_edge("limit", END)
    return graph.compile(checkpointer=checkpointer)
