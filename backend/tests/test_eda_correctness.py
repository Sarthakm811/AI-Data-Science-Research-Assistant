import math
import asyncio

import httpx
import numpy as np
import pandas as pd
import pytest
from scipy.stats import t as t_dist

from app.main import app
from app.utils.config import settings


def _request(method: str, url: str, **kwargs) -> httpx.Response:
    async def _run():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            return await client.request(method, url, **kwargs)

    return asyncio.run(_run())


@pytest.fixture
def auth_headers():
    return {
        "X-API-Key": settings.secret_key,
        "X-Tenant-Id": "public",
    }


def _upload_csv(auth_headers: dict, csv_text: str, filename: str = "data.csv") -> str:
    response = _request(
        "POST",
        "/api/datasets/upload",
        headers=auth_headers,
        files={"file": (filename, csv_text, "text/csv")},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert "id" in payload
    return payload["id"]


def test_eda_insight_payload_contract(auth_headers):
    csv_text = "\n".join(
        [
            "value_a,value_b,segment",
            "1,2,A",
            "2,4,A",
            "3,6,A",
            "4,8,B",
            "5,10,B",
            "6,12,B",
            "7,14,B",
            "100,200,A",
            ",18,B",
            "9,18,B",
        ]
    )

    dataset_id = _upload_csv(auth_headers, csv_text, filename="insights_contract.csv")

    response = _request(
        "POST",
        "/api/analysis/auto",
        headers={**auth_headers, "Content-Type": "application/json"},
        json={"session_id": "contract-test", "dataset_id": dataset_id, "analysis_type": "eda"},
    )
    assert response.status_code == 200, response.text

    body = response.json()
    assert body["status"] == "completed"
    eda = body["eda"]

    insights = eda.get("insights", [])
    assert isinstance(insights, list)
    assert len(insights) > 0

    allowed_types = {"warning", "info", "success"}
    for insight in insights:
        assert set(["type", "title", "desc"]).issubset(insight.keys())
        assert insight["type"] in allowed_types
        assert isinstance(insight["title"], str) and insight["title"].strip()
        assert isinstance(insight["desc"], str) and insight["desc"].strip()
        if "action" in insight:
            assert isinstance(insight["action"], str)

    for key in ["trendInsights", "segmentationInsights", "behavioralInsights", "comparativeInsights"]:
        arr = eda.get(key)
        assert isinstance(arr, list)
        assert len(arr) > 0
        for item in arr:
            assert set(["title", "detail", "confidence"]).issubset(item.keys())
            assert isinstance(item["title"], str) and item["title"].strip()
            assert isinstance(item["detail"], str) and item["detail"].strip()
            assert isinstance(item["confidence"], str) and item["confidence"].strip()


def test_eda_correlation_ground_truth(auth_headers):
    x = np.arange(1, 11)
    y = 2 * x
    z = 11 - x
    df = pd.DataFrame({"x": x, "y": y, "z": z})
    csv_text = df.to_csv(index=False)

    dataset_id = _upload_csv(auth_headers, csv_text, filename="corr_truth.csv")

    response = _request(
        "POST",
        "/api/analysis/auto",
        headers={**auth_headers, "Content-Type": "application/json"},
        json={"session_id": "corr-test", "dataset_id": dataset_id, "analysis_type": "eda"},
    )
    assert response.status_code == 200, response.text

    correlations = response.json()["eda"]["correlations"]
    assert len(correlations) == 3

    by_pair = {
        tuple(sorted([c["feature1"], c["feature2"]])): c
        for c in correlations
    }

    xy = by_pair[("x", "y")]
    xz = by_pair[("x", "z")]
    yz = by_pair[("y", "z")]

    assert math.isclose(xy["correlation"], 1.0, rel_tol=0.0, abs_tol=1e-12)
    assert math.isclose(xz["correlation"], -1.0, rel_tol=0.0, abs_tol=1e-12)
    assert math.isclose(yz["correlation"], -1.0, rel_tol=0.0, abs_tol=1e-12)

    for corr in correlations:
        assert len(corr.get("scatterData", [])) == len(df)
        assert corr["strength"] in {"Weak", "Moderate", "Strong", "Very Strong"}


def test_statistics_math_ground_truth(auth_headers):
    csv_text = "\n".join(
        [
            "group,category,val",
            "A,X,1",
            "A,X,2",
            "A,Y,3",
            "A,Y,4",
            "A,X,5",
            "B,X,6",
            "B,Y,7",
            "B,Y,8",
            "B,X,9",
            "B,Y,10",
        ]
    )

    dataset_id = _upload_csv(auth_headers, csv_text, filename="stats_truth.csv")

    response = _request(
        "POST",
        "/api/statistics-math/analyze",
        headers={**auth_headers, "Content-Type": "application/json"},
        json={
            "dataset_id": dataset_id,
            "numeric_column": "val",
            "group_column": "group",
            "categorical_column": "category",
            "confidence_level": 0.95,
            "probability_value": 7,
        },
    )
    assert response.status_code == 200, response.text

    body = response.json()

    probability = body["probability"]
    ci = body["confidence_intervals"]
    hyp = body["hypothesis_testing"]

    values = np.arange(1, 11, dtype=float)
    expected_mean = float(np.mean(values))
    expected_std = float(np.std(values, ddof=1))

    assert math.isclose(probability["mean"], expected_mean, rel_tol=0.0, abs_tol=1e-12)
    assert math.isclose(probability["std"], expected_std, rel_tol=0.0, abs_tol=1e-12)
    assert probability["sample_size"] == 10

    alpha = 1 - 0.95
    stderr = expected_std / math.sqrt(len(values))
    margin = float(t_dist.ppf(1 - alpha / 2, df=len(values) - 1) * stderr)
    assert math.isclose(ci["mean"], expected_mean, rel_tol=0.0, abs_tol=1e-12)
    assert math.isclose(ci["margin_of_error"], margin, rel_tol=0.0, abs_tol=1e-12)
    assert math.isclose(ci["lower"], expected_mean - margin, rel_tol=0.0, abs_tol=1e-12)
    assert math.isclose(ci["upper"], expected_mean + margin, rel_tol=0.0, abs_tol=1e-12)

    assert "t_test" in hyp
    assert "chi_square" in hyp

    t_test = hyp["t_test"]
    assert t_test["group_a"] == "A"
    assert t_test["group_b"] == "B"
    assert math.isclose(t_test["mean_a"], 3.0, rel_tol=0.0, abs_tol=1e-12)
    assert math.isclose(t_test["mean_b"], 8.0, rel_tol=0.0, abs_tol=1e-12)
    assert t_test["p_value"] < 0.05

    chi = hyp["chi_square"]
    assert chi["group_column"] == "group"
    assert chi["categorical_column"] == "category"
    assert chi["contingency_shape"] == [2, 2]
