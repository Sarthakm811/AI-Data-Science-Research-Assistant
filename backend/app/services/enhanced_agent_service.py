"""Enhanced Agent Service with AutoEDA, AutoML, and Report Generation"""

import google.generativeai as genai
from typing import Dict, Any, Optional
import uuid
import logging
import pandas as pd

from app.utils.config import settings
from app.tools.kaggle_tool import KaggleTool
from app.tools.execution_tool import ExecutionTool
from app.tools.eda_tool import EDATool
from app.tools.ml_tool import MLTool
from app.tools.report_generator import ReportGenerator

logger = logging.getLogger(__name__)


class EnhancedAgentService:
    """Enhanced agent with AutoEDA, AutoML, and comprehensive insights"""

    def __init__(self):
        genai.configure(api_key=settings.gemini_api_key)
        self.model = genai.GenerativeModel("models/gemini-2.0-flash")
        self.kaggle_tool = KaggleTool()
        self.execution_tool = ExecutionTool()
        self.eda_tool = EDATool()
        self.ml_tool = MLTool()
        self.report_gen = ReportGenerator()

    async def handle_comprehensive_query(
        self,
        session_id: str,
        query: str,
        dataset_id: Optional[str] = None,
        auto_eda: bool = True,
        auto_ml: bool = False,
    ) -> Dict[str, Any]:
        """Comprehensive analysis with EDA, ML, and insights"""
        job_id = str(uuid.uuid4())

        try:
            logger.info(f"Starting comprehensive analysis for job {job_id}")

            # Get dataset
            dataset_path = None
            if dataset_id:
                dataset_path = await self.kaggle_tool.download_dataset(dataset_id)

            # Load data if available
            df = None
            if dataset_path:
                import os

                csv_files = [f for f in os.listdir(dataset_path) if f.endswith(".csv")]
                if csv_files:
                    df = pd.read_csv(os.path.join(dataset_path, csv_files[0]))

            results = {"job_id": job_id, "status": "completed", "query": query}

            # Perform Auto EDA
            if auto_eda and df is not None:
                logger.info(f"Performing AutoEDA for job {job_id}")
                eda_results = self.eda_tool.perform_full_eda(df, job_id)
                eda_summary = self.eda_tool.generate_eda_summary(eda_results)
                results["eda"] = eda_results
                results["eda_summary"] = eda_summary

            # Perform Auto ML
            if auto_ml and df is not None:
                logger.info(f"Performing AutoML for job {job_id}")
                # Try to detect target column from query
                target_col = self._detect_target_column(query, df)
                if target_col:
                    ml_results = self.ml_tool.auto_train_models(df, target_col)
                    results["ml_results"] = ml_results

            # Generate AI insights using Gemini
            insights_prompt = self._build_insights_prompt(query, results)
            insights_response = self.model.generate_content(insights_prompt)
            results["insights"] = insights_response.text

            # Generate code if needed
            if "code" in query.lower() or "python" in query.lower():
                code_prompt = self._build_code_prompt(query, results)
                code_response = self.model.generate_content(code_prompt)
                results["code"] = self._extract_code(code_response.text)

            # Generate report
            report_path = self.report_gen.generate_markdown_report(results, job_id)
            results["report_path"] = report_path

            # Generate notebook if code exists
            if "code" in results:
                notebook_path = self.report_gen.generate_notebook(
                    results["code"], job_id
                )
                results["notebook_path"] = notebook_path

            # Session/history update skipped (no Redis)

            return results

        except Exception as e:
            logger.error(f"Error in job {job_id}: {str(e)}", exc_info=True)
            return {"job_id": job_id, "status": "failed", "error": str(e)}

    def _detect_target_column(self, query: str, df: pd.DataFrame) -> Optional[str]:
        """Detect target column from query"""
        query_lower = query.lower()

        # Common target keywords
        target_keywords = ["predict", "target", "label", "outcome", "classify"]

        for col in df.columns:
            if any(keyword in col.lower() for keyword in target_keywords):
                return col

        # Check if query mentions a column
        for col in df.columns:
            if col.lower() in query_lower:
                return col

        return None

    def _build_insights_prompt(self, query: str, results: Dict[str, Any]) -> str:
        """Build prompt for generating insights"""
        context = []

        if "eda_summary" in results:
            context.append(f"EDA Summary:\n{results['eda_summary']}")

        if "ml_results" in results:
            ml = results["ml_results"]
            context.append(f"\nML Results:\n- Best Model: {ml['best_model']}")
            context.append(f"- Performance: {ml['best_score']}")

        context_str = "\n".join(context)

        return f"""You are an expert data scientist providing insights.

User Question: {query}

Analysis Results:
{context_str}

Provide:
1. Key findings (3-5 bullet points)
2. Actionable insights
3. Recommendations for next steps
4. Potential hypotheses for research

Be specific, professional, and insightful."""

    def _build_code_prompt(self, query: str, results: Dict[str, Any]) -> str:
        """Build prompt for code generation"""
        return f"""Generate Python code for: {query}

Requirements:
- Use pandas, numpy, matplotlib, seaborn
- Include comments
- Save outputs to /outputs/
- Handle errors gracefully

Provide complete, runnable code."""

    def _extract_code(self, response_text: str) -> str:
        """Extract code from response"""
        lines = response_text.split("\n")
        code_lines = []
        in_code_block = False

        for line in lines:
            if "```python" in line:
                in_code_block = True
                continue
            elif "```" in line and in_code_block:
                break
            elif in_code_block:
                code_lines.append(line)

        return "\n".join(code_lines) if code_lines else response_text
