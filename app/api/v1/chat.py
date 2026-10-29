import json
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sse_starlette.sse import EventSourceResponse

from app.agent.service import ChatService
from app.schemas.chat import ChatRequest

router = APIRouter(prefix="/api/v1/chat", tags=["Agent Chat API"])


def get_chat_service(request: Request) -> ChatService:
    return request.app.state.chat_service


async def generate_chat_stream(service: ChatService, message: str, thread_id: str):
    async for event in service.stream(message, thread_id):
        data = event["data"]
        yield {
            "event": event["event"],
            "data": data if isinstance(data, str) else json.dumps(data, ensure_ascii=False),
        }


@router.post("/stream")
async def chat_stream_endpoint(
    request: ChatRequest,
    service: Annotated[ChatService, Depends(get_chat_service)],
):
    return EventSourceResponse(
        generate_chat_stream(service, request.message, request.thread_id),
        media_type="text/event-stream",
    )
