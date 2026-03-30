"""
Executor worker that runs sandboxed Python code.
Reads jobs from stdin (JSON) and writes results to stdout.
Redis dependency removed — orchestration is handled by the FastAPI backend.
"""
import os
import sys
import json
import subprocess
import tempfile
import logging
from typing import Dict, Any

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MAX_EXECUTION_TIME = int(os.getenv("MAX_EXECUTION_TIME", "45"))


def execute_code(code: str, job_id: str) -> Dict[str, Any]:
    """Execute code in an isolated temporary directory."""
    with tempfile.TemporaryDirectory() as workdir:
        outputs_dir = os.path.join(workdir, "outputs")
        os.makedirs(outputs_dir, exist_ok=True)

        script_path = os.path.join(workdir, "script.py")
        with open(script_path, "w") as f:
            f.write(code)

        try:
            result = subprocess.run(
                [sys.executable, script_path],
                capture_output=True,
                text=True,
                timeout=MAX_EXECUTION_TIME,
                cwd=workdir,
            )
            return {
                "job_id": job_id,
                "status": "success" if result.returncode == 0 else "error",
                "stdout": result.stdout,
                "stderr": result.stderr,
                "returncode": result.returncode,
            }
        except subprocess.TimeoutExpired:
            return {
                "job_id": job_id,
                "status": "timeout",
                "error": f"Execution exceeded {MAX_EXECUTION_TIME}s",
            }
        except Exception as e:
            return {"job_id": job_id, "status": "error", "error": str(e)}


def main() -> None:
    """Read a JSON job from stdin, execute it, write result to stdout."""
    raw = sys.stdin.read().strip()
    if not raw:
        print(json.dumps({"status": "error", "error": "No input received"}))
        return
    try:
        job = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"status": "error", "error": f"Invalid JSON: {e}"}))
        return

    job_id = job.get("job_id", "unknown")
    code = job.get("code", "")
    if not code:
        print(json.dumps({"job_id": job_id, "status": "error", "error": "No code provided"}))
        return

    result = execute_code(code, job_id)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
