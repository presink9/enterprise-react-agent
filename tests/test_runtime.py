import asyncio
import subprocess
import sys
from unittest.mock import AsyncMock, MagicMock

import pytest
import uvicorn
from langgraph.checkpoint.memory import InMemorySaver

from app.core.config import Settings
from app.core.runtime import checkpoint_store, create_chat_service


def test_import_does_not_load_models_or_connect_database():
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "import sys; import app.main; "
            "assert 'sentence_transformers' not in sys.modules; "
            "assert 'chromadb' not in sys.modules; "
            "assert 'psycopg_pool' not in sys.modules",
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stderr


def test_server_uses_postgres_compatible_loop():
    factory = uvicorn.Config(
        "app.main:app", loop="app.core.event_loop:loop_factory"
    ).get_loop_factory()
    loop = factory()
    try:
        assert isinstance(loop, asyncio.SelectorEventLoop)
    finally:
        loop.close()


def test_memory_backend_needs_no_database():
    async def scenario():
        async with checkpoint_store(Settings(_env_file=None, CHECKPOINT_BACKEND="memory")) as saver:
            assert isinstance(saver, InMemorySaver)

    asyncio.run(scenario())


@pytest.mark.parametrize("body_fails", [False, True])
def test_model_clients_close_on_service_exit(monkeypatch, model_factory, body_fails):
    import app.core.runtime as runtime

    model = MagicMock()
    model.root_async_client.close = AsyncMock()
    monkeypatch.setattr(runtime, "create_llm", lambda settings: model)
    monkeypatch.setattr(runtime, "build_agent", MagicMock())

    async def scenario():
        async with create_chat_service(Settings(_env_file=None, CHECKPOINT_BACKEND="memory")):
            if body_fails:
                raise RuntimeError("consumer failed")

    if body_fails:
        with pytest.raises(RuntimeError, match="consumer failed"):
            asyncio.run(scenario())
    else:
        asyncio.run(scenario())
    model.root_async_client.close.assert_awaited_once()
    model.root_client.close.assert_called_once()


@pytest.mark.parametrize("setup_fails", [False, True])
def test_postgres_pool_is_closed_even_when_setup_fails(monkeypatch, setup_fails):
    import langgraph.checkpoint.postgres.aio as postgres
    import psycopg_pool

    pool = MagicMock()
    pool.__aenter__ = AsyncMock(return_value=pool)
    pool.__aexit__ = AsyncMock(return_value=False)
    pool.wait = AsyncMock()
    saver = MagicMock()
    saver.setup = AsyncMock(side_effect=RuntimeError("setup failed") if setup_fails else None)
    monkeypatch.setattr(psycopg_pool, "AsyncConnectionPool", MagicMock(return_value=pool))
    monkeypatch.setattr(postgres, "AsyncPostgresSaver", MagicMock(return_value=saver))

    async def scenario():
        async with checkpoint_store(
            Settings(_env_file=None, CHECKPOINT_BACKEND="postgres")
        ) as result:
            assert result is saver

    if setup_fails:
        with pytest.raises(RuntimeError, match="setup failed"):
            asyncio.run(scenario())
    else:
        asyncio.run(scenario())
    pool.__aexit__.assert_awaited_once()
    pool.wait.assert_awaited_once_with(timeout=30)
