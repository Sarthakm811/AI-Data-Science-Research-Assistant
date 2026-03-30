from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.tools.kaggle_tool import KaggleTool

router = APIRouter()
kaggle_tool = KaggleTool()


class DatasetSearchRequest(BaseModel):
    query: str
    page: int = 1
    limit: int = 10


@router.post("/datasets/search")
async def search_datasets(req: DatasetSearchRequest):
    """Search Kaggle datasets."""
    try:
        results = await kaggle_tool.search_datasets(req.query, req.page)
        # Return under "datasets" key to match frontend expectation
        return {"datasets": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
