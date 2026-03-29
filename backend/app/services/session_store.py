"""
In-memory session store replacing Redis.
Thread-safe, process-local, no external dependencies.
"""

from __future__ import annotations

import threading
from collections import defaultdict, deque
from datetime import datetime
from typing import Any, Dict, List, Optional


class SessionStore:
    """Simple in-memory store for sessions and chat history."""

    def __init__(self, history_limit: int = 50):
        self._lock = threading.Lock()
        self._sessions: Dict[str, Dict[str, Any]] = {}
        self._history: Dict[str, deque] = defaultdict(lambda: deque(maxlen=history_limit))

    # ── Session helpers ──────────────────────────────────────────────────────

    def set_session(self, session_id: str, data: Dict[str, Any]) -> None:
        with self._lock:
            self._sessions[session_id] = data

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            return self._sessions.get(session_id)

    def delete_session(self, session_id: str) -> None:
        with self._lock:
            self._sessions.pop(session_id, None)
            self._history.pop(session_id, None)

    # ── History helpers ──────────────────────────────────────────────────────

    def append_to_history(self, session_id: str, message: Dict[str, Any]) -> None:
        with self._lock:
            self._history[session_id].append(message)

    def get_history(self, session_id: str, limit: int = 10) -> List[Dict[str, Any]]:
        with self._lock:
            items = list(self._history[session_id])
            return items[-limit:] if limit else items

    def clear_history(self, session_id: str) -> None:
        with self._lock:
            self._history[session_id].clear()


# Module-level singleton used by all routers
_store = SessionStore()


def get_store() -> SessionStore:
    return _store
