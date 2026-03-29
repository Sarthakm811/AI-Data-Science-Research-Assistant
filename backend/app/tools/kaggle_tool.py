import os
from typing import Dict, Any, List
from kaggle.api.kaggle_api_extended import KaggleApi
from app.utils.config import settings


class KaggleTool:
    def __init__(self):
        self.api = KaggleApi()
        self._authenticated = False

    def _ensure_authenticated(self):
        """Lazy authentication for Kaggle API"""
        if self._authenticated:
            return

        try:
            if settings.kaggle_username and settings.kaggle_key:
                os.environ["KAGGLE_USERNAME"] = settings.kaggle_username
                os.environ["KAGGLE_KEY"] = settings.kaggle_key
            
            # If no credentials found in env/settings, this will look for kaggle.json
            self.api.authenticate()
            import logging
            logging.getLogger(__name__).info("Kaggle API successfully authenticated.")
            self._authenticated = True
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Kaggle authentication failed or missing: {e}. Kaggle features will be unavailable.")
            from fastapi import HTTPException
            raise HTTPException(
                status_code=503, 
                detail="Kaggle API is not authenticated. Please provide credentials in environment variables."
            )

    async def search_datasets(self, query: str, page: int = 1) -> List[Dict[str, Any]]:
        """Search Kaggle datasets"""
        self._ensure_authenticated()
        datasets = self.api.dataset_list(search=query, page=page)
        return [
            {
                "id": f"{ds.ref}",
                "title": ds.title,
                "size": ds.size,
                "url": f"https://www.kaggle.com/datasets/{ds.ref}",
            }
            for ds in datasets[:10]
        ]

    async def get_dataset_info(self, dataset_id: str) -> Dict[str, Any]:
        """Get dataset metadata"""
        self._ensure_authenticated()
        try:
            metadata = self.api.dataset_metadata(dataset_id)
            return {
                "id": dataset_id,
                "title": metadata.get("title", ""),
                "description": metadata.get("description", ""),
                "columns": metadata.get("columns", []),
            }
        except Exception as e:
            return {"id": dataset_id, "error": str(e)}

    async def get_dataset_summary(self, dataset_id: str) -> str:
        """Get dataset summary for prompt"""
        info = await self.get_dataset_info(dataset_id)
        return f"Dataset: {info.get('title', dataset_id)}\nDescription: {info.get('description', 'N/A')}"

    async def download_dataset(self, dataset_id: str, path: str = "/data"):
        """Download dataset to local path"""
        self._ensure_authenticated()
        os.makedirs(path, exist_ok=True)
        self.api.dataset_download_files(dataset_id, path=path, unzip=True)
        return path
