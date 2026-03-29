import re
from pathlib import Path

files = [
    "reports/pdf_generator.py",
    "eda/statistical_analysis.py",
    "app/ml_engine.py",
    "eda/enhanced_visualizations.py"
]

for f in files:
    p = Path(f)
    if not p.exists():
        continue
    content = p.read_text(encoding="utf-8")
    content = re.sub(r'(\n\s*)except:', r'\1except Exception:', content)
    content = re.sub(r'(\s+)bars = ax1\.barh\(', r'\1ax1.barh(', content)
    content = re.sub(r'(\s+)z_outliers = z_scores > 3', r'\1pass # z_outliers unused', content)
    p.write_text(content, encoding="utf-8")
