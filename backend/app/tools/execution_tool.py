import subprocess
import os
import json
import tempfile
from typing import Dict, Any
from app.utils.config import settings
import logging

logger = logging.getLogger(__name__)


class ExecutionTool:
    """Executes generated Python code in a sandboxed environment"""

    def __init__(self):
        self.max_time = settings.max_execution_time
        self.max_memory = settings.max_memory_mb

    async def execute(
        self, code: str, dataset_id: str = None, job_id: str = None
    ) -> Dict[str, Any]:
        """Execute code safely and return results"""

        if not settings.allow_code_execution:
            return {
                "status": "disabled",
                "error": "Code execution is disabled by server policy. Set ALLOW_CODE_EXECUTION=true to enable.",
            }

        # Create temp workspace
        with tempfile.TemporaryDirectory() as workdir:
            outputs_dir = os.path.join(workdir, "outputs")
            os.makedirs(outputs_dir, exist_ok=True)

            # Prepare code with safety wrapper
            wrapped_code = self._wrap_code(code, dataset_id, outputs_dir)

            script_path = os.path.join(workdir, "script.py")
            with open(script_path, "w") as f:
                f.write(wrapped_code)

            # Execute with timeout
            try:
                result = subprocess.run(
                    ["python", script_path],
                    capture_output=True,
                    text=True,
                    timeout=self.max_time,
                    cwd=workdir,
                )

                # Collect results
                results = self._collect_results(outputs_dir)
                artifacts = self._collect_artifacts(outputs_dir)

                return {
                    "status": "success" if result.returncode == 0 else "error",
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                    "results": results,
                    "artifacts": artifacts,
                }

            except subprocess.TimeoutExpired:
                logger.error(f"Execution timeout for job {job_id}")
                return {
                    "status": "timeout",
                    "error": f"Execution exceeded {self.max_time}s limit",
                }
            except Exception as e:
                logger.error(f"Execution error for job {job_id}: {str(e)}")
                return {"status": "error", "error": str(e)}

    def _wrap_code(self, code: str, dataset_id: str, outputs_dir: str) -> str:
        """Wrap user code with safety and data loading"""
        return f"""
import sys
import os
import json
import warnings
warnings.filterwarnings('ignore')

# Set paths
DATA_PATH = "/data/{dataset_id if dataset_id else ''}"
OUTPUTS_DIR = "{outputs_dir}"

# Restrict imports
__builtins__.__dict__['__import__'] = lambda *args, **kwargs: None

try:
    # User code
{self._indent_code(code, 4)}

except Exception as e:
    print(f"Error: {{str(e)}}", file=sys.stderr)
    sys.exit(1)
"""

    def _indent_code(self, code: str, spaces: int) -> str:
        """Indent code block"""
        indent = " " * spaces
        return "\n".join(indent + line for line in code.split("\n"))

    def _collect_results(self, outputs_dir: str) -> Dict[str, Any]:
        """Collect results.json if exists"""
        results_path = os.path.join(outputs_dir, "results.json")
        if os.path.exists(results_path):
            with open(results_path, "r") as f:
                return json.load(f)
        return {}

    def _collect_artifacts(self, outputs_dir: str) -> list:
        """Collect generated artifacts (images, CSVs)"""
        artifacts = []
        for file in os.listdir(outputs_dir):
            if file.endswith((".png", ".jpg", ".csv", ".html")):
                artifacts.append(os.path.join(outputs_dir, file))
        return artifacts
