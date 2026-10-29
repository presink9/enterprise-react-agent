from uuid import uuid4

from pydantic import BaseModel, Field, field_validator


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=20000, description="用户输入的提问内容")
    thread_id: str = Field(
        default_factory=lambda: uuid4().hex,
        min_length=1,
        max_length=128,
        pattern=r"^[a-zA-Z0-9_.:-]+$",
        description="会话 ID；省略时创建独立会话，从 session 事件获取后复用",
    )

    @field_validator("message")
    @classmethod
    def non_blank_message(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("message must not be blank")
        return value.strip()


class ChatResponse(BaseModel):
    thread_id: str
    response: str
    intent: str | None = None
