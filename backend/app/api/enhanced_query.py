"""Enhanced Query API with AutoEDA and AutoML"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.services.enhanced_agent_service import EnhancedAgentService

router = APIRouter()


class EnhancedQueryRequest(BaseModel):
    session_id: str
    query: str
    dataset_id: Optional[str] = None
    auto_eda: bool = True
    auto_ml: bool = False


class DatasetSearchRequest(BaseModel):
    query: str


class AutoAnalysisRequest(BaseModel):
    session_id: str
    dataset_id: str
    analysis_type: str = "full"  # full, eda, ml


@router.post("/query/enhanced")
async def enhanced_query(request: EnhancedQueryRequest):
    """Enhanced query with AutoEDA and AutoML"""
    try:

        agent = EnhancedAgentService()

        result = await agent.handle_comprehensive_query(
            session_id=request.session_id,
            query=request.query,
            dataset_id=request.dataset_id,
            auto_eda=request.auto_eda,
            auto_ml=request.auto_ml,
        )

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/datasets/search")
async def search_datasets(request: DatasetSearchRequest):
    """Search Kaggle datasets"""
    try:


        agent = EnhancedAgentService()

        results = await agent.kaggle_tool.search_datasets(request.query)
        return {"datasets": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analysis/auto")
async def auto_analysis(request: AutoAnalysisRequest):
    """Automatic comprehensive analysis"""
    try:


        agent = EnhancedAgentService()

        query = f"Perform {request.analysis_type} analysis on this dataset"

        result = await agent.handle_comprehensive_query(
            session_id=request.session_id,
            query=query,
            dataset_id=request.dataset_id,
            auto_eda=True,
            auto_ml=(request.analysis_type in ["full", "ml"]),
        )

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
