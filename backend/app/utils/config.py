from pydantic_settings import BaseSettings
from pydantic import ConfigDict, model_validator
from typing import Optional


class Settings(BaseSettings):
    # API Keys
    gemini_api_key: str = "MISSING_GEMINI_API_KEY"
    kaggle_username: Optional[str] = None
    kaggle_key: Optional[str] = None

    # Database
    database_url: Optional[str] = None

    # Security
    secret_key: str = "change-me-in-production"
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
            "MISSING_GEMINI_API_KEY",
        }
        # We only log or provide a warning during initialization. 
        # API endpoints will fail when used if these are still weak.
        if self.secret_key in weak_values or self.gemini_api_key in weak_values:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning("CRITICAL: Application initialized with missing or default secrets (GEMINI_API_KEY or SECRET_KEY).")
        return self


settings = Settings()
