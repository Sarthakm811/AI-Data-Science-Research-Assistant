"""
Tool Registry - MCP-style tool discovery and invocation
"""

import json
from pathlib import Path
from typing import Dict, List, Optional
import logging

logger = logging.getLogger(__name__)


class ToolRegistry:
    """Registry for MCP-style tool manifests"""

    def __init__(self, manifests_dir: Optional[str] = None):
        if manifests_dir is None:
            self.manifests_dir = Path(__file__).parent / "manifests"
        else:
            self.manifests_dir = Path(manifests_dir)
        self.tools: Dict[str, dict] = {}
        self.load_manifests()

    def load_manifests(self):
        """Load all tool manifests from directory"""
        if not self.manifests_dir.exists():
            logger.warning(f"Manifests directory not found: {self.manifests_dir}")
            return

        for manifest_file in self.manifests_dir.glob("*.json"):
            try:
                with open(manifest_file, "r") as f:
                    manifest = json.load(f)
                    tool_id = manifest.get("tool_id")
                    if tool_id:
                        self.tools[tool_id] = manifest
                        logger.info(f"Loaded tool: {tool_id}")
            except Exception as e:
                logger.error(f"Failed to load manifest {manifest_file}: {e}")

    def get_tool(self, tool_id: str) -> Optional[dict]:
        """Get tool manifest by ID"""
        return self.tools.get(tool_id)

    def list_tools(self, scope: Optional[List[str]] = None) -> List[dict]:
        """List all tools, optionally filtered by scope"""
        if not scope:
            return list(self.tools.values())

        # Filter by scope
        filtered = []
        for tool in self.tools.values():
            tool_scopes = tool.get("auth", {}).get("scope", [])
            if any(s in tool_scopes for s in scope):
                filtered.append(tool)
        return filtered

    def validate_inputs(self, tool_id: str, inputs: dict) -> tuple[bool, Optional[str]]:
        """Validate inputs against tool manifest"""
        tool = self.get_tool(tool_id)
        if not tool:
            return False, f"Tool not found: {tool_id}"

        manifest_inputs = tool.get("inputs", {})

        # Check required inputs
        for param_name, param_spec in manifest_inputs.items():
            if param_spec.get("required", False) and param_name not in inputs:
                return False, f"Missing required parameter: {param_name}"

        # Check types (basic validation)
        for param_name, value in inputs.items():
            if param_name not in manifest_inputs:
                return False, f"Unknown parameter: {param_name}"

            expected_type = manifest_inputs[param_name].get("type")
            if expected_type == "string" and not isinstance(value, str):
                return False, f"Parameter {param_name} must be string"
            elif expected_type == "integer" and not isinstance(value, int):
                return False, f"Parameter {param_name} must be integer"
            elif expected_type == "boolean" and not isinstance(value, bool):
                return False, f"Parameter {param_name} must be boolean"

        return True, None

    def check_constraints(
        self, tool_id: str, inputs: dict
    ) -> tuple[bool, Optional[str]]:
        """Check if inputs meet tool constraints"""
        tool = self.get_tool(tool_id)
        if not tool:
            return False, f"Tool not found: {tool_id}"

        constraints = tool.get("constraints", {})

        # Example constraint checks
        if "max_size_mb" in constraints and "size_mb" in inputs:
            if inputs["size_mb"] > constraints["max_size_mb"]:
                return False, f"Size exceeds limit: {constraints['max_size_mb']} MB"

        return True, None


# Global registry instance
tool_registry = ToolRegistry()
