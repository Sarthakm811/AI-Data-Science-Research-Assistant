"""
Tool Registry API Routes
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
from .tool_registry import tool_registry

router = APIRouter(prefix="/v1/tools", tags=["tools"])


class ToolCallRequest(BaseModel):
    inputs: Dict[str, Any]
    metadata: Optional[Dict[str, Any]] = {}


class ToolCallResponse(BaseModel):
    task_id: str
    status: str
    message: str


@router.get("/")
async def list_tools(scope: Optional[str] = None):
    """List all available tools"""
    scopes = [scope] if scope else None
    tools = tool_registry.list_tools(scopes)
    return {"tools": tools, "count": len(tools)}


@router.get("/{tool_id}")
async def get_tool(tool_id: str):
    """Get tool manifest by ID"""
    tool = tool_registry.get_tool(tool_id)
    if not tool:
        raise HTTPException(status_code=404, detail=f"Tool not found: {tool_id}")
    return tool


@router.post("/{tool_id}/validate")
async def validate_tool_inputs(tool_id: str, request: ToolCallRequest):
    """Validate inputs against tool manifest"""
    # Check if tool exists
    tool = tool_registry.get_tool(tool_id)
    if not tool:
        raise HTTPException(status_code=404, detail=f"Tool not found: {tool_id}")

    # Validate inputs
    valid, error = tool_registry.validate_inputs(tool_id, request.inputs)
    if not valid:
        return {"valid": False, "error": error}

    # Check constraints
    valid, error = tool_registry.check_constraints(tool_id, request.inputs)
    if not valid:
        return {"valid": False, "error": error}

    return {"valid": True, "message": "Inputs are valid"}


@router.post("/{tool_id}/call")
async def call_tool(tool_id: str, request: ToolCallRequest):
    """
    Call a tool (creates a task)
    This endpoint validates inputs and creates a task for execution
    """
    # Validate tool exists
    tool = tool_registry.get_tool(tool_id)
    if not tool:
        raise HTTPException(status_code=404, detail=f"Tool not found: {tool_id}")

    # Validate inputs
    valid, error = tool_registry.validate_inputs(tool_id, request.inputs)
    if not valid:
        raise HTTPException(status_code=400, detail=error)

    # Check constraints
    valid, error = tool_registry.check_constraints(tool_id, request.inputs)
    if not valid:
        raise HTTPException(status_code=400, detail=error)

    # TODO: Create task and publish to orchestrator
    # For now, return mock response
    import uuid

    task_id = str(uuid.uuid4())

    return ToolCallResponse(
        task_id=task_id,
        status="queued",
        message=f"Tool {tool_id} call queued for execution",
    )
