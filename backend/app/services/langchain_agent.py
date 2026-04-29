"""
LangChain-based agent orchestration for DS Research Assistant
Integrates Gemini + Kaggle + custom tools
"""

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.agents import AgentExecutor, create_react_agent
from langchain.tools import Tool
from langchain.prompts import PromptTemplate
from typing import Dict, Any, List
import logging

from app.utils.config import settings
from app.tools.kaggle_tool import KaggleTool
from app.tools.execution_tool import ExecutionTool
from app.services.dataset_context import format_dataframe_context

logger = logging.getLogger(__name__)


class LangChainAgent:
    """LangChain orchestration for multi-tool agent"""

    def __init__(self):
        # Initialize Gemini via LangChain
        self.llm = ChatGoogleGenerativeAI(
            model="models/gemini-2.0-flash",
            google_api_key=settings.gemini_api_key,
            temperature=0.1,
            convert_system_message_to_human=True,
        )

        # Initialize tools
        self.kaggle_tool = KaggleTool()
        self.execution_tool = ExecutionTool()

        # Create LangChain tools
        self.tools = self._create_tools()

        # Create agent
        self.agent = self._create_agent()

    def _create_tools(self) -> List[Tool]:
        """Create LangChain tool wrappers"""
        return [
            Tool(
                name="search_kaggle_datasets",
                func=self._search_datasets_sync,
                description="Search for Kaggle datasets by query. Input: search query string. Returns: list of datasets with id, title, size.",
            ),
            Tool(
                name="get_dataset_info",
                func=self._get_dataset_info_sync,
                description="Get detailed information about a Kaggle dataset. Input: dataset_id (format: username/dataset-name). Returns: metadata including columns and description.",
            ),
            Tool(
                name="execute_python_code",
                func=self._execute_code_sync,
                description="Execute Python code for data analysis. Input: Python code as string. The code should use pandas, numpy, sklearn, matplotlib. Returns: execution results and artifacts.",
            ),
            Tool(
                name="generate_analysis_plan",
                func=self._generate_plan,
                description="Generate a step-by-step analysis plan. Input: user query and dataset context. Returns: structured analysis plan.",
            ),
        ]

    def _create_agent(self) -> AgentExecutor:
        """Create ReAct agent with tools"""

        prompt = PromptTemplate.from_template(
            """
You are an expert data science research assistant. You have access to Kaggle datasets and can execute Python code for analysis.

Available tools:
{tools}

Tool names: {tool_names}

Use the following format:

Question: the input question you must answer
Thought: you should always think about what to do
Action: the action to take, should be one of [{tool_names}]
Action Input: the input to the action
Observation: the result of the action
... (this Thought/Action/Action Input/Observation can repeat N times)
Thought: I now know the final answer
Final Answer: the final answer to the original input question

Begin!

Question: {input}
Thought: {agent_scratchpad}
"""
        )

        agent = create_react_agent(llm=self.llm, tools=self.tools, prompt=prompt)

        return AgentExecutor(
            agent=agent,
            tools=self.tools,
            verbose=True,
            max_iterations=5,
            handle_parsing_errors=True,
        )

    async def run(self, query: str, context: Dict[str, Any] = None) -> Dict[str, Any]:
        """Run agent with query"""
        try:
            # Add context to query if provided
            full_query = query
            if context and context.get("dataset_id"):
                full_query = f"Using dataset {context['dataset_id']}: {query}"

            dataset_context = ""
            if context:
                raw_context = context.get("dataset_context")
                if isinstance(raw_context, str):
                    dataset_context = raw_context
                elif raw_context is not None:
                    dataset_context = format_dataframe_context(raw_context)

            if dataset_context:
                full_query = f"{full_query}\n\nLive dataset context:\n{dataset_context}"

            # Execute agent
            result = await self.agent.ainvoke({"input": full_query})

            return {
                "status": "success",
                "output": result.get("output", ""),
                "intermediate_steps": result.get("intermediate_steps", []),
            }
        except Exception as e:
            logger.error(f"LangChain agent error: {str(e)}")
            return {"status": "error", "error": str(e)}

    # Sync wrappers for tools (LangChain requires sync functions)
    def _search_datasets_sync(self, query: str) -> str:
        """Sync wrapper for dataset search"""
        import asyncio

        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        results = loop.run_until_complete(self.kaggle_tool.search_datasets(query))
        return str(results[:3])  # Return top 3

    def _get_dataset_info_sync(self, dataset_id: str) -> str:
        """Sync wrapper for dataset info"""
        import asyncio

        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        info = loop.run_until_complete(self.kaggle_tool.get_dataset_info(dataset_id))
        return str(info)

    def _execute_code_sync(self, code: str) -> str:
        """Sync wrapper for code execution"""
        import asyncio

        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        result = loop.run_until_complete(self.execution_tool.execute(code))
        return f"Status: {result['status']}, Output: {result.get('stdout', '')[:500]}"

    def _generate_plan(self, query: str) -> str:
        """Generate analysis plan"""
        plan_prompt = f"""
Given this data science query: "{query}"

Generate a step-by-step analysis plan with 3-5 steps.
Each step should be concrete and actionable.

Plan:
"""
        response = self.llm.invoke(plan_prompt)
        return response.content
