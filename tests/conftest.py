import asyncio
import sys

import pytest
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from pydantic import PrivateAttr

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def pytest_addoption(parser):
    parser.addoption("--run-integration", action="store_true", default=False)


def pytest_collection_modifyitems(config, items):
    if config.getoption("--run-integration"):
        return
    skip = pytest.mark.skip(reason="需要 --run-integration 以及已配置的外部服务")
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip)


class ScriptedModel(FakeMessagesListChatModel):
    _seen: list = PrivateAttr(default_factory=list)

    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self._seen.append(list(messages))
        return super()._generate(messages, stop=stop, run_manager=run_manager, **kwargs)


@pytest.fixture
def model_factory():
    return lambda *responses: ScriptedModel(responses=list(responses))
