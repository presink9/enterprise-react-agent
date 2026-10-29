"""Uvicorn loop factory compatible with psycopg async on Windows."""

import asyncio


def loop_factory() -> asyncio.AbstractEventLoop:
    return asyncio.SelectorEventLoop()
