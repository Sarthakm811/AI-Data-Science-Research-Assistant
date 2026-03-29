from fastapi import APIRouter, HTTPException
from app.schemas.query import QueryRequest, QueryResponse
from app.services.agent_service import AgentService

router = APIRouter()


@router.post("/query", response_model=QueryResponse)
async def query(req: QueryRequest):
    """Handle user query and orchestrate analysis."""
    try:
        agent = AgentService()
        result = await agent.handle_query(req.session_id, req.query, req.dataset_id)
        return QueryResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
