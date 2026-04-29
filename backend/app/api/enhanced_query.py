"""Enhanced Query API for live uploaded datasets."""

from __future__ import annotations

import uuid
from typing import Any, Dict, Optional

import google.generativeai as genai
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.runtime_state import DATASETS, eda_engine, ml_engine
from app.services.dataset_context import format_dataframe_context
from app.utils.config import settings

router = APIRouter()


class EnhancedQueryRequest(BaseModel):
	session_id: str
	query: str
	dataset_id: Optional[str] = None
	auto_eda: bool = True
	auto_ml: bool = False
	target_column: Optional[str] = None


@router.post("/query/enhanced")
async def query_enhanced(req: EnhancedQueryRequest) -> Dict[str, Any]:
	if not req.dataset_id or req.dataset_id not in DATASETS:
		raise HTTPException(status_code=404, detail="Dataset not found")

	df = DATASETS[req.dataset_id]
	job_id = str(uuid.uuid4())
	live_context = format_dataframe_context(df)

	result: Dict[str, Any] = {
		"job_id": job_id,
		"status": "completed",
		"session_id": req.session_id,
		"dataset_id": req.dataset_id,
		"query": req.query,
	}

	if req.auto_eda:
		result["eda"] = eda_engine.full_analysis(df)

	if req.auto_ml and req.target_column and req.target_column in df.columns:
		try:
			ml_results = ml_engine.train_all_models(
				df=df,
				target_column=req.target_column,
				task_type="auto",
				use_gpu=True,
			)
			result["ml"] = {
				"task_type": ml_results.get("task_type"),
				"best_model_name": ml_results.get("best_model_name"),
				"models": ml_results.get("models", []),
			}
		except Exception as exc:
			result["ml"] = {"status": "skipped", "reason": str(exc)}

	prompt = f"""You are a data science assistant.

Use only the live dataset context below when answering the user.

Dataset context:
{live_context}

User question: {req.query}

Write a concise, evidence-based answer grounded in the dataset above."""

	try:
		genai.configure(api_key=settings.gemini_api_key)
		model = genai.GenerativeModel("models/gemini-2.0-flash")
		response = model.generate_content(prompt)
		explanation = getattr(response, "text", "") or ""
	except Exception as exc:
		explanation = f"Generated analysis from live dataset context. Gemini unavailable: {exc}"

	result["explanation"] = explanation
	result["dataset_context"] = live_context
	return result
