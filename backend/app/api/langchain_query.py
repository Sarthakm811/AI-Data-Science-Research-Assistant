"""LangChain-powered query endpoint (optional — gracefully disabled if deps are missing)."""

from fastapi import APIRouter, HTTPException
import uuid

from app.schemas.query import QueryRequest, QueryResponse

router = APIRouter()


@router.post("/query/langchain", response_model=QueryResponse)
async def query_with_langchain(req: QueryRequest):
    """Handle query using LangChain multi-tool orchestration."""
    job_id = str(uuid.uuid4())
    try:
        # Lazy import so a version mismatch doesn't crash the whole server at startup
        try:
            from app.services.langchain_agent import LangChainAgent
        except Exception as import_err:
            raise HTTPException(
                status_code=503,
                detail=f"LangChain agent unavailable (dependency issue): {import_err}"
            )

        agent = LangChainAgent()
        context = {"dataset_id": req.dataset_id} if req.dataset_id else {}
        result = await agent.run(req.query, context)

        return QueryResponse(
            job_id=job_id,
            status=result.get("status", "completed"),
            explanation=result.get("output", ""),
            error=result.get("error"),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
