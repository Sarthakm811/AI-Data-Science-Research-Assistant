import sys
import os
import logging

# Basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("RenderHealthCheck")

def test_imports():
    """Verify that all core dependencies and internal modules can be imported."""
    core_packages = [
        "fastapi", "uvicorn", "pydantic", "pydantic_settings", 
        "pandas", "numpy", "sklearn", "scipy", "statsmodels"
    ]
    
    passed = True
    for pkg in core_packages:
        try:
            __import__(pkg)
            logger.info(f"✅ Package '{pkg}' imported successfully.")
        except ImportError as e:
            logger.error(f"❌ Failed to import package '{pkg}': {e}")
            passed = False
            
    # Test internal app structure
    try:
        sys.path.append(os.getcwd())
        from app.utils.config import settings
        logger.info("✅ App 'settings' loaded (resiliently).")
        
        from app.main import app
        logger.info("✅ App entrypoint 'app.main:app' loaded.")
    except Exception as e:
        logger.error(f"❌ Failed to load application modules: {e}")
        passed = False
        
    return passed

if __name__ == "__main__":
    logger.info("Starting Render Health Check...")
    if test_imports():
        logger.info("Deployment Readiness: PASSED.")
        sys.exit(0)
    else:
        logger.error("Deployment Readiness: FAILED.")
        sys.exit(1)
