"""ASGI entry point. Importing this module performs no network or model I/O."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.chat import router as chat_router
from app.core.config import Settings, get_settings
from app.core.runtime import create_chat_service


def create_app(settings: Settings | None = None, *, service=None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        if service is not None:
            application.state.chat_service = service
            yield
        else:
            async with create_chat_service(settings) as chat_service:
                application.state.chat_service = chat_service
                yield

    application = FastAPI(
        title="企业财税 ReAct Agent",
        description="支持工具调用、混合检索与会话持久化的智能问答服务",
        version="0.2.0",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "Authorization"],
    )
    application.include_router(chat_router)

    @application.get("/")
    async def health_check():
        return {"status": "ok", "message": "Enterprise AI Agent Service is running!"}

    return application


app = create_app()
