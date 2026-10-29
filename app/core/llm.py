"""Model factory for the existing OpenAI-compatible provider."""

from langchain_openai import ChatOpenAI

from app.core.config import Settings


def create_llm(settings: Settings) -> ChatOpenAI:
    api_key = settings.OPENAI_API_KEY.get_secret_value()
    if not api_key or api_key == "your-api-key":
        raise ValueError("请配置 OPENAI_API_KEY（现有模型服务商的 API Key）")
    return ChatOpenAI(
        model=settings.MODEL_NAME,
        api_key=api_key,
        base_url=settings.OPENAI_BASE_URL or None,
        temperature=0.3,
        timeout=settings.MODEL_TIMEOUT,
        max_retries=settings.MODEL_MAX_RETRIES,
    )
