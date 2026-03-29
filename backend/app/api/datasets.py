from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
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
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/datasets/{dataset_id}")
async def get_dataset(dataset_id: str):
    """Get dataset details."""
    try:
        info = await kaggle_tool.get_dataset_info(dataset_id)
        return info
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))
