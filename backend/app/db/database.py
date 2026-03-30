"""
Database configuration — SQLAlchemy with optional PostgreSQL.
Firebase support removed (unused).
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import logging

from app.utils.config import settings

logger = logging.getLogger(__name__)

engine = None
SessionLocal = None
Base = declarative_base()


def init_db() -> None:
    """Initialize database connection and create tables."""
    global engine, SessionLocal

    if not settings.database_url:
        logger.warning("No DATABASE_URL configured — database features disabled.")
        return

    logger.info("Initializing database")
    engine = create_engine(
        settings.database_url,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    logger.info("Database initialized successfully")


def get_db():
    """FastAPI dependency for a database session."""
    if SessionLocal is None:
        init_db()
    if SessionLocal is None:
        raise RuntimeError("Database is not configured. Set DATABASE_URL.")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
