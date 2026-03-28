from pydantic_settings import BaseSettings
from pydantic import ConfigDict, model_validator
from typing import Optional


class Settings(BaseSettings):
    # API Keys
    gemini_api_key: str
    kaggle_username: Optional[str] = None
    kaggle_key: Optional[str] = None

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Database
    database_url: Optional[str] = None

    # Security
    secret_key: str
    enforce_api_key: bool = True
    enforce_tenant_isolation: bool = True
    allow_code_execution: bool = False

    # Execution limits
    max_execution_time: int = 45
    max_memory_mb: int = 1536

    # Vector DB
    vector_db_url: Optional[str] = None
    vector_db_api_key: Optional[str] = None

    # Observability
    otel_exporter_otlp_endpoint: Optional[str] = None

    model_config = ConfigDict(env_file=(".env", "backend/.env"), case_sensitive=False)

    @model_validator(mode="after")
    def validate_secrets(self):
        weak_values = {
            "change-me-in-production",
            "dev-secret-key-change-in-production",
            "",
        }
        if self.secret_key in weak_values:
            raise ValueError("SECRET_KEY must be set to a strong non-default value")
        return self


settings = Settings()
