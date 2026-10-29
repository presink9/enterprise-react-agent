from urllib.parse import urlsplit

import pytest
from pydantic import ValidationError

from app.core.config import ROOT_DIR, Settings
from app.core.llm import create_llm


def test_environment_overrides_dotenv(tmp_path, monkeypatch):
    path = tmp_path / ".env"
    path.write_text("MODEL_NAME=file-model\nUNKNOWN_SETTING=ignored\n", encoding="utf-8")
    monkeypatch.setenv("MODEL_NAME", "env-model")
    assert Settings(_env_file=path).MODEL_NAME == "env-model"


def test_database_uri_encodes_credentials():
    settings = Settings(
        _env_file=None, POSTGRES_USER="a@b", POSTGRES_PASSWORD="p:/@?", POSTGRES_DB="my db"
    )
    uri = settings.DB_URI
    assert "a%40b" in uri
    assert "p%3A%2F%40%3F" in uri
    assert urlsplit(uri).path == "/my%20db"
    assert "p:/@?" not in repr(settings)


def test_paths_and_invalid_settings():
    assert Settings(_env_file=None, DOCS_DIR="data/docs").DOCS_DIR == ROOT_DIR / "data/docs"
    with pytest.raises(ValidationError):
        Settings(_env_file=None, AGENT_MAX_ITERATIONS=0)
    with pytest.raises(ValueError, match="OPENAI_API_KEY"):
        create_llm(Settings(_env_file=None, OPENAI_API_KEY=""))
