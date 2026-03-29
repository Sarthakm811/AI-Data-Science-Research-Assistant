from fastapi import APIRouter
from datetime import datetime
import uuid

from app.schemas.query import SessionCreate, SessionResponse
from app.services.session_store import get_store

router = APIRouter()


@router.post("/sessions", response_model=SessionResponse)
def create_session(req: SessionCreate):
    """Create a new session."""
    session_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    get_store().set_session(session_id, {
        "session_id": session_id,
        "user_id": req.user_id,
        "created_at": now,
        "last_activity": now,
    })

    return SessionResponse(session_id=session_id, created_at=now, last_activity=now)


@router.get("/sessions/{session_id}/history")
def get_session_history(session_id: str):
    """Get session history."""
    history = get_store().get_history(session_id)
    return {"history": history}
