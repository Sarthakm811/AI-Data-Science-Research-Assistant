"""
Database configuration supporting PostgreSQL and Firebase
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import logging

from app.utils.config import settings

logger = logging.getLogger(__name__)

# SQLAlchemy setup for PostgreSQL
engine = None
SessionLocal = None
Base = declarative_base()


def init_db():
    """Initialize database connection"""
    global engine, SessionLocal

    if settings.database_url:
        logger.info("Initializing PostgreSQL database")
        engine = create_engine(
            settings.database_url, pool_pre_ping=True, pool_size=10, max_overflow=20
        )
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

        # Create tables
        Base.metadata.create_all(bind=engine)
        logger.info("Database initialized successfully")
    else:
        logger.warning("No database URL configured")


def get_db():
    """Dependency for getting DB session"""
    if SessionLocal is None:
        init_db()

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Firebase setup (optional)
firebase_db = None


def init_firebase():
    """Initialize Firebase (optional alternative to PostgreSQL)"""
    global firebase_db

    try:
        import firebase_admin
        from firebase_admin import credentials, firestore

        # Initialize Firebase app
        if not firebase_admin._apps:
            cred = credentials.Certificate("firebase-credentials.json")
            firebase_admin.initialize_app(cred)

        firebase_db = firestore.client()
        logger.info("Firebase initialized successfully")
    except Exception as e:
        logger.warning(f"Firebase initialization failed: {str(e)}")


def get_firebase_db():
    """Get Firebase Firestore client"""
    if firebase_db is None:
        init_firebase()
    return firebase_db
