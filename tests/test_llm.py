import pytest

from app.core.config import get_settings
from app.core.llm import create_llm

pytestmark = pytest.mark.integration


def test_provider_connection():
    response = create_llm(get_settings()).invoke("请只回复：连接成功")
    assert response.content
