from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SkillEdge Persistent Stock Engine"
    app_env: str = "local"
    engine_version: str = "holly_persistent_v2"

    # Supabase
    next_public_supabase_url: str | None = None
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None
    supabase_service_key: str | None = None

    # Data providers
    fmp_api_key: str | None = None
    fmp_plan: str = "premium"

    # Runtime
    redis_url: str | None = None

    signal_stock_legacy_engine_enabled: bool = False
    signal_stock_persistent_engine_enabled: bool = True

    model_config = SettingsConfigDict(
        env_file=(
            ".env.local",
            "../.env.local",
            "../../.env.local",
            "../../../.env.local",
        ),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def resolved_supabase_url(self) -> str | None:
        return self.supabase_url or self.next_public_supabase_url

    @property
    def resolved_supabase_service_key(self) -> str | None:
        return self.supabase_service_role_key or self.supabase_service_key


@lru_cache
def get_settings() -> Settings:
    return Settings()
