"""Validated configuration; reading settings never opens external resources."""

from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import quote

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    OPENAI_API_KEY: SecretStr = SecretStr("")
    OPENAI_BASE_URL: str = "https://ark.cn-beijing.volces.com/api/v3"
    MODEL_NAME: str = "ep-2026xxxx-chat"
    MODEL_TIMEOUT: float = Field(default=60, gt=0)
    MODEL_MAX_RETRIES: int = Field(default=2, ge=0)
    AGENT_MAX_ITERATIONS: int = Field(default=4, ge=1, le=20)
    CHAT_TIMEOUT: float = Field(default=180, gt=0)
    CHECKPOINT_BACKEND: Literal["postgres", "memory"] = "postgres"
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: SecretStr = SecretStr("postgrespassword")
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = Field(default=5432, ge=1, le=65535)
    POSTGRES_DB: str = "agent_db"
    POSTGRES_SSLMODE: str = "prefer"
    POSTGRES_POOL_SIZE: int = Field(default=20, ge=1)
    DOCS_DIR: Path = ROOT_DIR / "data" / "docs"
    PERSIST_DB_DIR: Path = ROOT_DIR / "data" / "chroma_db"
    CHROMA_COLLECTION: str = "langchain"
    EMBEDDING_MODEL: str = "BAAI/bge-m3"
    RERANKER_MODEL: str = "BAAI/bge-reranker-large"
    EMBEDDING_DEVICE: str = "cpu"
    RETRIEVAL_TOP_K: int = Field(default=10, ge=1)
    RETRIEVAL_TOP_N: int = Field(default=3, ge=1, le=10)
    CORS_ORIGINS: list[str] = Field(default_factory=list)

    @field_validator("DOCS_DIR", "PERSIST_DB_DIR")
    @classmethod
    def resolve_project_path(cls, value: Path) -> Path:
        return value if value.is_absolute() else ROOT_DIR / value

    @property
    def DB_URI(self) -> str:
        user = quote(self.POSTGRES_USER, safe="")
        password = quote(self.POSTGRES_PASSWORD.get_secret_value(), safe="")
        database = quote(self.POSTGRES_DB, safe="")
        return (
            f"postgresql://{user}:{password}@{self.POSTGRES_HOST}:"
            f"{self.POSTGRES_PORT}/{database}?sslmode={quote(self.POSTGRES_SSLMODE)}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
