import sys, json
sys.path.insert(0, 'backend')
from app.eda_engine import EDAEngine
import pandas as pd

# Test with numeric-only dataset (no correlationHeatmap)
df1 = pd.DataFrame({'a': [1, 2, 3], 'b': ['x', 'y', 'z']})
# Test with single numeric column (no correlations)
df2 = pd.DataFrame({'a': [1, 2, 3], 'b': [4, 5, 6]})

e = EDAEngine()

for label, df in [('single_numeric', df1), ('two_numeric', df2)]:
    r = e.full_analysis(df)
    print(f'\n=== {label} ===')
    fields = ['correlationHeatmap', 'missingHeatmap', 'qualityRadar', 'typeCount',
              'numericColumns', 'dateColumns', 'trendInsights', 'segmentationInsights',
              'behavioralInsights', 'comparativeInsights', 'statistics', 'correlations']
    for f in fields:
        v = r.get(f)
        t = type(v).__name__
        if isinstance(v, list):
            print(f'  {f}: list[{len(v)}]')
        elif isinstance(v, dict):
            print(f'  {f}: dict keys={list(v.keys())}')
        else:
            print(f'  {f}: {t} = {v}')
