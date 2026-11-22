from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./snackflow.db"
    secret_key: str = "change-this-in-production"
    access_token_minutes: int = 720
    factory_state: str = "Tamil Nadu"
    variance_tolerance_percent: str = "3"

    # Operations
    app_env: str = "development"
    log_level: str = "INFO"
    # Comma-separated allowlist. "*" is only honoured outside production.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    login_max_attempts: int = 8
    login_window_seconds: int = 300

    # Pagination defaults
    default_page_size: int = Field(default=50, ge=1, le=500)
    max_page_size: int = Field(default=200, ge=1, le=1000)

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() in {"production", "prod"}

    @property
    def cors_origin_list(self) -> list[str]:
        origins = [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]
        if self.is_production and "*" in origins:
            raise ValueError("Wildcard CORS origin is not permitted in production")
        return origins or ["http://localhost:5173"]

    @property
    def cors_origin_regex(self) -> str | None:
        """In development any loopback port is allowed (Vite may fall back to another port)."""
        if self.is_production:
            return None
        return r"^https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$"


settings = Settings()
