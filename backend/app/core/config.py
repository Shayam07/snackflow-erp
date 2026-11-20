import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str = "sqlite:///./snackflow.db"
    secret_key: str = "change-this-in-production"
    access_token_minutes: int = 720
    factory_state: str = "Tamil Nadu"
    variance_tolerance_percent: str = "3"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
