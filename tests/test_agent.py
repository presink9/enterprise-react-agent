import asyncio
import json

import pytest
from langchain_core.documents import Document
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.checkpoint.memory import InMemorySaver

from app.agent.graph import build_agent
from app.agent.tools import create_search_tool


def call(query="申报流程", call_id="call-1", name="search_knowledge_base"):
    return AIMessage(
        content="内部工具决策文本",
        tool_calls=[{"name": name, "args": {"query": query}, "id": call_id}],
    )


def run(graph, question="问题", thread="test"):
    return asyncio.run(
        graph.ainvoke(
            {"messages": [HumanMessage(content=question)]},
            {"configurable": {"thread_id": thread}},
        )
    )


def test_direct_answer_does_not_retrieve(model_factory):
    def unexpected(query):
        raise AssertionError("should not retrieve")

    model = model_factory(AIMessage(content="你好"))
    result = run(build_agent(model, [create_search_tool(unexpected)]))
    assert result["messages"][-1].content == "你好"
    assert result["iterations"] == 0
    assert result["intent"] == "general_chat"


def test_react_observes_results_and_rewrites_query(model_factory):
    queries = []

    def search(query):
        queries.append(query)
        return (
            []
            if len(queries) == 1
            else [
                Document(
                    page_content="先登记", metadata={"source": "指南.docx", "breadcrumb": "申报"}
                )
            ]
        )

    model = model_factory(call(), call("企业所得税登记", "call-2"), AIMessage(content="先登记"))
    result = run(build_agent(model, [create_search_tool(search)]))
    assert queries == ["申报流程", "企业所得税登记"]
    assert result["iterations"] == 2
    assert result["intent"] == "rag_search"
    first_observation = model._seen[1][-1]
    assert isinstance(first_observation, ToolMessage)
    assert json.loads(first_observation.content)["found"] is False
    evidence = json.loads(model._seen[2][-1].content)["documents"][0]
    assert evidence["source"] == "指南.docx"
    assert evidence["breadcrumb"] == "申报"


@pytest.mark.parametrize("failure", ["exception", "unknown", "invalid"])
def test_tool_failure_returns_observation(model_factory, failure):
    def broken(query):
        raise RuntimeError("secret-should-not-leak")

    action = call(name="unknown" if failure == "unknown" else "search_knowledge_base")
    if failure == "invalid":
        action = AIMessage(
            content="", tool_calls=[{"name": "search_knowledge_base", "args": {}, "id": "bad"}]
        )
    model = model_factory(action, AIMessage(content="暂时无法查询"))
    result = run(build_agent(model, [create_search_tool(broken)]))
    observation = result["messages"][-2]
    assert isinstance(observation, ToolMessage)
    assert observation.status == "error"
    assert "secret-should-not-leak" not in observation.content
    assert result["messages"][-1].content == "暂时无法查询"


def test_tool_limit_closes_every_pending_call(model_factory):
    queries = []
    model = model_factory(call(), call(call_id="call-2"))
    graph = build_agent(
        model, [create_search_tool(lambda q: queries.append(q) or [])], max_iterations=1
    )
    result = run(graph)
    assert len(queries) == 1
    assert "上限" in result["messages"][-1].content
    assert result["messages"][-2].tool_call_id == "call-2"
    assert result["messages"][-2].status == "error"


def test_multiple_tool_calls_in_one_round(model_factory):
    first = call()
    first.tool_calls.append(
        {"name": "search_knowledge_base", "args": {"query": "税种"}, "id": "other"}
    )
    model = model_factory(first, AIMessage(content="综合回答"))
    result = run(build_agent(model, [create_search_tool(lambda q: [])]))
    observations = [m for m in result["messages"] if isinstance(m, ToolMessage)]
    assert {m.tool_call_id for m in observations} == {"call-1", "other"}
    assert result["iterations"] == 1


def test_sessions_are_isolated_and_budget_resets(model_factory):
    model = model_factory(
        call(),
        AIMessage(content="一"),
        call(call_id="second"),
        AIMessage(content="二"),
        AIMessage(content="三"),
    )
    graph = build_agent(
        model, [create_search_tool(lambda q: [])], checkpointer=InMemorySaver(), max_iterations=1
    )

    async def scenario():
        first = await graph.ainvoke(
            {"messages": [HumanMessage(content="我的名字是小明")]},
            {"configurable": {"thread_id": "a"}},
        )
        second = await graph.ainvoke(
            {"messages": [HumanMessage(content="继续查询")]}, {"configurable": {"thread_id": "a"}}
        )
        other = await graph.ainvoke(
            {"messages": [HumanMessage(content="你好")]}, {"configurable": {"thread_id": "b"}}
        )
        return first, second, other

    first, second, other = asyncio.run(scenario())
    assert first["iterations"] == second["iterations"] == 1
    assert any(m.content == "我的名字是小明" for m in second["messages"])
    assert all(m.content != "我的名字是小明" for m in other["messages"])
    assert other["intent"] == "general_chat"


def test_interrupted_tool_history_is_repaired_before_next_user_message(model_factory):
    model = model_factory(AIMessage(content="继续"))
    graph = build_agent(model, [create_search_tool(lambda q: [])], checkpointer=InMemorySaver())

    async def scenario():
        config = {"configurable": {"thread_id": "interrupted"}}
        await graph.aupdate_state(
            config,
            {"messages": [HumanMessage(content="旧问题"), call()], "iterations": 0},
            as_node="agent",
        )
        return await graph.ainvoke({"messages": [HumanMessage(content="新问题")]}, config)

    history = asyncio.run(scenario())["messages"]
    assert isinstance(history[2], ToolMessage)
    assert history[2].tool_call_id == "call-1"
    assert history[3].content == "新问题"


def test_malformed_model_tool_output_is_rejected(model_factory):
    model = model_factory(
        AIMessage(
            content="",
            invalid_tool_calls=[
                {"name": "search_knowledge_base", "args": "{", "id": "invalid", "error": "bad JSON"}
            ],
        )
    )
    with pytest.raises(ValueError, match="malformed"):
        run(build_agent(model, []))
