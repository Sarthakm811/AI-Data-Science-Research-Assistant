import asyncio
import sys
import types

import pandas as pd
import pytest

from app.api.enhanced_query import EnhancedQueryRequest, query_enhanced
from app.api.langchain_query import query_with_langchain
from app.runtime_state import DATASETS, set_current_tenant
from app.services import agent_service as agent_service_module
from app.services.agent_service import AgentService
from app.utils.config import settings


@pytest.fixture
def auth_headers():
    return {
        "X-API-Key": settings.secret_key,
        "X-Tenant-Id": "tenant-a",
    }


def _seed_dataset(dataset_id: str, df: pd.DataFrame) -> None:
    set_current_tenant("tenant-a")
    DATASETS[dataset_id] = df


def test_query_uses_live_dataframe_context(monkeypatch, auth_headers):
    df = pd.DataFrame(
        {
            "feature_a": [1, 2, 3],
            "feature_b": ["alpha", "beta", "gamma"],
        }
    )
    dataset_id = "ds-query-context"
    _seed_dataset(dataset_id, df)

    captured = {}

    class FakeResponse:
        text = "PLAN:\nUse the live dataframe context.\nCODE:\n```python\n```\nEXPLANATION:\nDone"

    class FakeModel:
        def __init__(self, *args, **kwargs):
            pass

        def generate_content(self, prompt):
            captured["prompt"] = prompt
            return FakeResponse()

    monkeypatch.setattr(agent_service_module.genai, "GenerativeModel", FakeModel)

    response = asyncio.run(AgentService().handle_query("s1", "What columns are in this dataset?", dataset_id))

    assert response["status"] == "completed"
    assert response["explanation"] == "Done"
    assert "feature_a" in captured["prompt"]
    assert "feature_b" in captured["prompt"]
    assert "alpha" in captured["prompt"]


def test_langchain_query_passes_live_context(monkeypatch, auth_headers):
    df = pd.DataFrame(
        {
            "feature_x": [10, 20, 30],
            "feature_y": ["red", "green", "blue"],
        }
    )
    dataset_id = "ds-langchain-context"
    _seed_dataset(dataset_id, df)

    captured = {}

    fake_langchain_module = types.ModuleType("app.services.langchain_agent")

    class FakeAgent:
        def __init__(self, *args, **kwargs):
            pass

        async def run(self, query, context=None):
            captured["query"] = query
            captured["context"] = context or {}
            return {"status": "success", "output": "langchain-ok"}

    fake_langchain_module.LangChainAgent = FakeAgent
    sys.modules["app.services.langchain_agent"] = fake_langchain_module

    response = asyncio.run(
        query_with_langchain(
            types.SimpleNamespace(session_id="s2", query="Summarize this dataset", dataset_id=dataset_id)
        )
    )

    assert response.status == "success"
    assert response.explanation == "langchain-ok"
    assert captured["context"]["dataset_id"] == dataset_id
    assert "feature_x" in captured["context"]["dataset_context"]
    assert "red" in captured["context"]["dataset_context"]


def test_enhanced_query_uses_live_context(monkeypatch, auth_headers):
    df = pd.DataFrame(
        {
            "age": [21, 35, 42],
            "segment": ["A", "B", "A"],
        }
    )
    dataset_id = "ds-enhanced-context"
    _seed_dataset(dataset_id, df)

    captured = {}

    class FakeResponse:
        text = "Live answer"

    class FakeModel:
        def __init__(self, *args, **kwargs):
            pass

        def generate_content(self, prompt):
            captured["prompt"] = prompt
            return FakeResponse()

    monkeypatch.setattr("app.api.enhanced_query.genai.configure", lambda **kwargs: None)
    monkeypatch.setattr("app.api.enhanced_query.genai.GenerativeModel", FakeModel)

    response = asyncio.run(
        query_enhanced(
            EnhancedQueryRequest(
                session_id="s3",
                query="Give me an overview",
                dataset_id=dataset_id,
                auto_eda=True,
            )
        )
    )

    assert response["status"] == "completed"
    assert response["explanation"] == "Live answer"
    assert "age" in response["dataset_context"]
    assert "segment" in response["dataset_context"]
    assert "age" in captured["prompt"]
    assert "segment" in captured["prompt"]
