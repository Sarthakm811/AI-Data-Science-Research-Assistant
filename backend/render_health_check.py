import sys
import os
import logging
import time

# Basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("RenderHealthCheck")

def get_memory_usage():
    """Returns memory usage in MB if psutil is available."""
    try:
        import psutil
        process = psutil.Process(os.getpid())
        return process.memory_info().rss / 1024 / 1024
    except ImportError:
        return None

def test_imports():
    """Verify that all core dependencies and internal modules can be imported."""
    core_packages = [
        "fastapi", "uvicorn", "pydantic", "pydantic_settings", 
        "pandas", "numpy"
    ]
    
    # We intentionaly don't import heavy ML packages here to see the base footprint
    # unless we specifically want to test their existence.
    
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
        
        # Initial memory before loading app
        mem_before = get_memory_usage()
        if mem_before:
            logger.info(f"Memory usage before app load: {mem_before:.2f} MB")

        from app.utils.config import settings
        logger.info("✅ App 'settings' loaded (resiliently).")
        
        from app.main import app
        logger.info("✅ App entrypoint 'app.main:app' loaded.")
        
        # Memory after loading app
        mem_after = get_memory_usage()
        if mem_after:
            logger.info(f"Memory usage after app load: {mem_after:.2f} MB")
            if mem_after > 500:
                logger.warning("⚠️ Memory usage is very close to Render's 512MB limit!")
            elif mem_after > 512:
                logger.error("❌ Memory usage exceeds Render's 512MB limit! Deployment will likely fail.")
                passed = False
    except Exception as e:
        logger.error(f"❌ Failed to load application modules: {e}")
        passed = False
        
    return passed

if __name__ == "__main__":
    logger.info("Starting Render Health Check...")
    start_time = time.time()
    
    if test_imports():
        duration = time.time() - start_time
        logger.info(f"Deployment Readiness: PASSED (completed in {duration:.2f}s).")
        sys.exit(0)
    else:
        logger.error("Deployment Readiness: FAILED.")
        sys.exit(1)
