from typing import Literal

from langgraph.graph import MessagesState


class AgentState(MessagesState):
    """Messages persist across turns; counters reset at each graph entry."""

    iterations: int
    intent: Literal["general_chat", "rag_search"]
