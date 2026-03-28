import React, { useState } from 'react'
import { FileText, Download, Loader, CheckCircle, AlertCircle, BarChart3, Brain, Sigma, Eye, Settings, RefreshCw } from 'lucide-react'
import { useAnalysis } from '../context/AnalysisContext'

const STATUS_ICON_CLASS = {
    green: 'text-green-600',
    purple: 'text-blue-600',
    cyan: 'text-cyan-700'
}

function Reports({ dataset }) {
    const [ generating, setGenerating ] = useState(false)
    const [ reportData, setReportData ] = useState(null)
    const [ config, setConfig ] = useState({
        includeEDA: true,
        includeML: true,
        includeStatsMath: true,
        includeDataPreview: true
    })

    const { edaResults, mlResults, statsMathResults, hasResults } = useAnalysis()

    const generateReport = async () => {
        if (!dataset) return
        setGenerating(true)

        setTimeout(() => {
            const report = buildReport()
            setReportData(report)
            setGenerating(false)
        }, 1500)
    }

    const buildReport = () => {
        const now = new Date().toLocaleString()
        const allStats = edaResults?.statistics || []
        const allCorrelations = [ ...(edaResults?.correlations || []) ]
            .filter(c => Number.isFinite(c.correlation))
            .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
        const allMissing = edaResults?.missingData || []
        const allInsights = edaResults?.insights || []

        const toNumber = (value) => {
            const n = Number(value)
            return Number.isFinite(n) ? n : 0
        }

        let html = `<!DOCTYPE html><html><head>
<title>Professional Data Analysis Report - ${dataset.name}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
:root{
    --ink:#182433;
    --muted:#526274;
    --line:#d6dee8;
    --paper:#ffffff;
    --canvas:#f2f5f9;
    --brand:#0f5ea8;
    --brand-2:#103a5d;
    --accent:#d99700;
    --ok:#0f9d58;
    --warn:#ef8f00;
    --danger:#d32f2f;
}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Georgia,'Times New Roman',serif;line-height:1.6;color:var(--ink);background:var(--canvas);padding:24px}
.report{max-width:1200px;margin:0 auto;background:var(--paper);border:1px solid var(--line);box-shadow:0 14px 36px rgba(16,27,41,.12)}
.cover{padding:46px 54px;background:linear-gradient(135deg,var(--brand-2),var(--brand));color:#fff;border-bottom:6px solid var(--accent)}
.cover h1{font-size:2.2rem;letter-spacing:.4px;margin-bottom:8px}
.cover p{opacity:.92}
.meta-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:18px}
.meta-card{background:rgba(255,255,255,.12);padding:12px;border:1px solid rgba(255,255,255,.2)}
.meta-card .label{font-size:.75rem;text-transform:uppercase;opacity:.85}
.meta-card .value{font-size:1.15rem;font-weight:700}
.content{padding:34px 42px}
h2{margin:26px 0 12px;border-bottom:2px solid var(--line);padding-bottom:8px;color:var(--brand-2);font-size:1.45rem}
h3{margin:16px 0 10px;color:var(--brand);font-size:1.1rem}
h4{margin:10px 0 8px;color:var(--ink);font-size:1rem}
.toc{padding:16px 18px;border:1px solid var(--line);background:#fafcff}
.toc ol{margin-left:18px}
.toc li{margin:4px 0}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.kpi{border:1px solid var(--line);padding:12px;background:#fff}
.kpi .k{font-size:.78rem;text-transform:uppercase;color:var(--muted)}
.kpi .v{font-size:1.55rem;font-weight:700;color:var(--brand-2)}
.section{margin:24px 0;padding:18px;border:1px solid var(--line);background:#fbfcff}
table{width:100%;border-collapse:collapse;margin:12px 0;background:#fff;font-size:.92rem}
th,td{padding:9px 10px;text-align:left;border:1px solid var(--line);vertical-align:top}
th{background:#edf3fa;color:var(--brand-2);font-weight:700}
.badge{display:inline-block;padding:3px 9px;border-radius:14px;font-size:.76rem;font-weight:700}
.badge-success{background:#d9f4e7;color:#0b6f3d}
.badge-warning{background:#fff0cf;color:#925700}
.badge-danger{background:#ffe0df;color:#8f1f1f}
.badge-info{background:#e3eefb;color:#194a84}
.insight{padding:12px;margin:8px 0;border-left:4px solid var(--brand);background:#f5f9ff}
.insight-success{background:#ecf9f2;border-left-color:var(--ok)}
.insight-warning{background:#fff8ea;border-left-color:var(--warn)}
.insight-info{background:#eef6ff;border-left-color:var(--brand)}
.chart-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(430px,1fr));gap:14px}
.chart-card{border:1px solid var(--line);background:#fff;padding:12px}
.chart-card canvas{width:100%;max-height:340px}
.full-chart{border:1px solid var(--line);background:#fff;padding:12px;min-height:360px}
.full-chart canvas{width:100%;max-height:none}
.footer{margin-top:34px;padding-top:14px;border-top:1px solid var(--line);font-size:.88rem;color:var(--muted);text-align:center}
.break-page{page-break-before:always}
@media print{
    body{background:#fff;padding:0}
    .report{box-shadow:none;border:none}
    .section,.chart-card,.full-chart,.kpi,.toc{break-inside:avoid}
}
</style></head><body><div class="report">
<div class="cover">
    <h1>Professional Data Analysis Report</h1>
    <p>Comprehensive exploratory analysis, statistical profiling, correlations, visual insights, and model performance summary.</p>
    <div class="meta-grid">
        <div class="meta-card"><div class="label">Dataset</div><div class="value">${dataset.name}</div></div>
        <div class="meta-card"><div class="label">Generated</div><div class="value">${now}</div></div>
        <div class="meta-card"><div class="label">Rows × Columns</div><div class="value">${dataset.rowCount.toLocaleString()} × ${dataset.colCount}</div></div>
    </div>
</div>
<div class="content">`

        const formatValue = (v, digits = 4) => {
            if (v == null) return '-'
            const n = Number(v)
            return Number.isFinite(n) ? n.toFixed(digits) : String(v)
        }

        html += `<h2>Table of Contents</h2>
<div class="toc">
    <ol>
        <li>Dataset Overview</li>
        <li>EDA Summary and Data Quality</li>
        <li>Statistical Tables</li>
        <li>Correlation Analysis (All Pairs)</li>
        <li>Distribution Analysis (All Numeric Features)</li>
        <li>AI Insights</li>
        <li>Machine Learning Results</li>
        <li>Statistics and Mathematics</li>
        <li>Recommendations and Next Steps</li>
    </ol>
</div>`

        // Dataset Overview
        html += `<h2>1. Dataset Overview</h2>
<div class="kpi-grid">
<div class="kpi"><div class="k">Rows</div><div class="v">${dataset.rowCount.toLocaleString()}</div></div>
<div class="kpi"><div class="k">Columns</div><div class="v">${dataset.colCount}</div></div>
<div class="kpi"><div class="k">Numeric Columns</div><div class="v">${edaResults?.summary?.numericCols || '-'}</div></div>
<div class="kpi"><div class="k">Categorical Columns</div><div class="v">${edaResults?.summary?.categoricalCols || '-'}</div></div>
<div class="kpi"><div class="k">Data Quality Score</div><div class="v">${edaResults?.qualityScore || '-'}</div></div>
</div>`

        if (config.includeDataPreview) {
            html += `<h3>Data Preview</h3><table><thead><tr>${dataset.headers.slice(0, 8).map(h => `<th>${h}</th>`).join('')}</tr></thead>
<tbody>${dataset.rows.slice(0, 5).map(row => `<tr>${dataset.headers.slice(0, 8).map(h => `<td>${row[ h ] ?? '-'}</td>`).join('')}</tr>`).join('')}</tbody></table>`
        }

        // EDA Section
        if (config.includeEDA && edaResults) {
            html += `<h2>2. EDA Summary and Data Quality</h2><div class="section">
<div class="kpi-grid">
<div class="kpi"><div class="k">Quality Score</div><div class="v" style="color:${edaResults.qualityScore >= 80 ? '#0f9d58' : edaResults.qualityScore >= 60 ? '#ef8f00' : '#d32f2f'}">${edaResults.qualityScore}/100</div></div>
<div class="kpi"><div class="k">Missing Values</div><div class="v">${edaResults.summary?.missingTotal || 0}</div></div>
<div class="kpi"><div class="k">Outliers</div><div class="v">${edaResults.summary?.outlierTotal || 0}</div></div>
<div class="kpi"><div class="k">Duplicates</div><div class="v">${edaResults.summary?.duplicateRows || 0}</div></div>
<div class="kpi"><div class="k">Correlation Pairs</div><div class="v">${allCorrelations.length}</div></div>
<div class="kpi"><div class="k">Distribution Charts</div><div class="v">${allStats.length}</div></div>
</div>
<h3>3. Statistical Summary (All Numeric Columns)</h3><table><thead><tr><th>Column</th><th>Mean</th><th>Std</th><th>Min</th><th>Max</th><th>Outliers</th><th>Skewness</th></tr></thead>
<tbody>${(edaResults.statistics || []).map(s => `<tr><td><strong>${s.name}</strong></td><td>${s.mean?.toFixed?.(2) || s.mean}</td><td>${s.std?.toFixed?.(2) || s.std}</td><td>${s.min?.toFixed?.(2) || s.min}</td><td>${s.max?.toFixed?.(2) || s.max}</td><td><span class="badge ${s.outlierCount > 0 ? 'badge-warning' : 'badge-success'}">${s.outlierCount || 0}</span></td><td>${s.skewness || '-'}</td></tr>`).join('')}</tbody></table>
<h3>Missing Data Analysis</h3><table><thead><tr><th>Column</th><th>Missing</th><th>%</th><th>Status</th></tr></thead>
<tbody>${(edaResults.missingData || []).map(m => `<tr><td>${m.name}</td><td>${m.missing}</td><td>${m.percentage?.toFixed?.(1) || m.percentage}%</td><td><span class="badge ${parseFloat(m.percentage) === 0 ? 'badge-success' : parseFloat(m.percentage) < 10 ? 'badge-warning' : 'badge-danger'}">${parseFloat(m.percentage) === 0 ? 'Complete' : parseFloat(m.percentage) < 10 ? 'Low' : 'High'}</span></td></tr>`).join('')}</tbody></table>`

            // Correlations
            if (allCorrelations.length > 0) {
                html += `<h3>4. Correlation Analysis (All Pairs)</h3><table><thead><tr><th>#</th><th>Feature 1</th><th>Feature 2</th><th>Correlation</th><th>Strength</th><th>Direction</th></tr></thead>
<tbody>${allCorrelations.map((c, i) => `<tr><td>${i + 1}</td><td>${c.feature1}</td><td>${c.feature2}</td><td style="color:${c.correlation > 0 ? '#0f9d58' : '#d32f2f'}">${c.correlation?.toFixed?.(3) || c.correlation}</td><td><span class="badge badge-info">${c.strength || '-'}</span></td><td>${c.direction || (c.correlation > 0 ? 'Positive' : 'Negative')}</td></tr>`).join('')}</tbody></table>`
            }

            // Insights
            if (allInsights.length > 0) {
                html += `<h3>6. AI-Generated Insights</h3>`
                allInsights.forEach(i => {
                    html += `<div class="insight insight-${i.type === 'warning' ? 'warning' : i.type === 'success' ? 'success' : 'info'}"><strong>${i.title}:</strong> ${i.desc} <em>(${i.action})</em></div>`
                })
            }

            // Add Charts
            html += `<h3>5. Visual Analysis (Complete Coverage)</h3>`

            // Missing Data Chart
            if (edaResults.missingData?.length > 0) {
                const missingChartData = edaResults.missingData.filter(m => m.missing > 0).slice(0, 10)
                html += `<div class="chart-card"><h4>Missing Data by Column</h4><canvas id="missingChart"></canvas></div>
<script>
new Chart(document.getElementById('missingChart'), {
    type: 'bar',
    data: {
        labels: ${JSON.stringify(missingChartData.map(m => m.name))},
        datasets: [{
            label: 'Missing Values (%)',
            data: ${JSON.stringify(missingChartData.map(m => parseFloat(m.percentage)))},
            backgroundColor: 'rgba(239, 68, 68, 0.7)',
            borderColor: 'rgb(239, 68, 68)',
            borderWidth: 1
        }]
    },
    options: {
        responsive: true,
        plugins: { title: { display: true, text: 'Missing Data by Column' } },
        scales: { y: { beginAtZero: true, title: { display: true, text: 'Percentage (%)' } } }
    }
});
</script>`
            }

            // Overview statistics chart
            if (allStats.length > 0) {
                const statsData = allStats
                html += `<div class="chart-card"><h4>Statistical Summary Across Features</h4><canvas id="statsChart"></canvas></div>
<script>
new Chart(document.getElementById('statsChart'), {
    type: 'bar',
    data: {
        labels: ${JSON.stringify(statsData.map(s => s.name))},
        datasets: [{
            label: 'Mean',
            data: ${JSON.stringify(statsData.map(s => parseFloat(s.mean)))},
            backgroundColor: 'rgba(124, 58, 237, 0.7)'
        }, {
            label: 'Std Dev',
            data: ${JSON.stringify(statsData.map(s => parseFloat(s.std)))},
            backgroundColor: 'rgba(59, 130, 246, 0.7)'
        }]
    },
    options: {
        responsive: true,
        plugins: { title: { display: false } }
    }
});
</script>`
            }

            // Correlation chart for all pairs
            if (allCorrelations.length > 0) {
                html += `<div class="full-chart"><h4>All Correlations</h4><canvas id="corrChart" style="height:${Math.max(360, allCorrelations.length * 24)}px"></canvas></div>
<script>
new Chart(document.getElementById('corrChart'), {
    type: 'bar',
    data: {
        labels: ${JSON.stringify(allCorrelations.map(c => `${c.feature1} vs ${c.feature2}`))},
        datasets: [{
            label: 'Correlation',
            data: ${JSON.stringify(allCorrelations.map(c => c.correlation))},
            backgroundColor: ${JSON.stringify(allCorrelations.map(c => c.correlation > 0 ? 'rgba(15, 157, 88, 0.7)' : 'rgba(211, 47, 47, 0.7)'))},
            borderWidth: 1
        }]
    },
    options: {
        indexAxis: 'y',
        responsive: true,
        plugins: { title: { display: true, text: 'Top Correlations' } },
        scales: { x: { min: -1, max: 1 } }
    }
});
</script>`
            }

            // Distribution charts for every numeric column
            if (allStats.length > 0) {
                html += `<div class="break-page"></div><h3>Distribution Charts (All Numeric Features)</h3><div class="chart-grid">`
                allStats.forEach((s, i) => {
                    html += `<div class="chart-card"><h4>${s.name}</h4><canvas id="distChart_${i}"></canvas></div>`
                })
                html += `</div><script>`
                allStats.forEach((s, i) => {
                    html += `
new Chart(document.getElementById('distChart_${i}'), {
    type: 'bar',
    data: {
        labels: ${JSON.stringify((s.distribution || []).map(d => d.bin))},
        datasets: [{
            type: 'bar',
            label: 'Count',
            data: ${JSON.stringify((s.distribution || []).map(d => toNumber(d.count)))},
            backgroundColor: 'rgba(16, 94, 168, 0.55)',
            borderColor: 'rgba(16, 58, 93, 1)',
            borderWidth: 1
        }, {
            type: 'line',
            label: 'Distribution Shape',
            data: ${JSON.stringify((s.distribution || []).map(d => toNumber(d.count)))},
            borderColor: 'rgba(217, 151, 0, 1)',
            backgroundColor: 'rgba(217, 151, 0, 0.15)',
            tension: 0.3,
            fill: false,
            pointRadius: 0
        }]
    },
    options: {
        responsive: true,
        plugins: {
            title: { display: true, text: 'Distribution of ${s.name}' }
        },
        scales: {
            x: { ticks: { maxTicksLimit: 10 } },
            y: { beginAtZero: true }
        }
    }
});`
                })
                html += `</script>`
            }

            // Scatter charts for every correlation pair
            if (allCorrelations.length > 0) {
                html += `<div class="break-page"></div><h3>Correlation Scatter Charts (All Pairs)</h3><div class="chart-grid">`
                allCorrelations.forEach((c, i) => {
                    html += `<div class="chart-card"><h4>${c.feature1} vs ${c.feature2}</h4><canvas id="corrScatter_${i}"></canvas></div>`
                })
                html += `</div><script>`
                allCorrelations.forEach((c, i) => {
                    html += `
new Chart(document.getElementById('corrScatter_${i}'), {
    type: 'scatter',
    data: {
        datasets: [{
            label: '${c.feature1} vs ${c.feature2}',
            data: ${JSON.stringify((c.scatterData || []).map(p => ({ x: toNumber(p.x), y: toNumber(p.y) })))},
            pointRadius: 2,
            pointBackgroundColor: '${c.correlation > 0 ? 'rgba(15, 157, 88, 0.65)' : 'rgba(211, 47, 47, 0.65)'}'
        }]
    },
    options: {
        responsive: true,
        plugins: {
            title: { display: true, text: 'r = ${toNumber(c.correlation).toFixed(3)} (${c.strength || 'N/A'})' },
            legend: { display: false }
        },
        scales: {
            x: { title: { display: true, text: '${c.feature1}' } },
            y: { title: { display: true, text: '${c.feature2}' } }
        }
    }
});`
                })
                html += `</script>`
            }

            html += `</div>`
        }

        // ML Section
        if (config.includeML && mlResults) {
            const bestModel = mlResults.models?.[ 0 ]
            const isClassification = mlResults.taskType === 'classification'
            const isClustering = mlResults.taskType === 'clustering'
            const businessContext = mlResults.business_context || {}
            const selectedMetrics = mlResults.metrics || {}
            html += `<h2>7. Machine Learning Results</h2><div class="section">
<div class="insight insight-success"><strong>🏆 Best Model:</strong> ${bestModel?.type || bestModel?.name || 'N/A'} with ${isClassification ? (bestModel?.accuracy * 100)?.toFixed(1) + '% accuracy' : bestModel?.r2?.toFixed(4) + ' R² score'}</div>
<div class="grid">
<div class="card"><div class="card-value">${mlResults.models?.length || 0}</div><div class="card-label">Models Trained</div></div>
<div class="card"><div class="card-value">${mlResults.taskType || 'auto'}</div><div class="card-label">Task Type</div></div>
<div class="card"><div class="card-value">${mlResults.trainingTime?.toFixed(1) || '-'}s</div><div class="card-label">Training Time</div></div>
</div>
<h3>Model Comparison (Top 10)</h3><table><thead><tr><th>#</th><th>Model</th><th>Category</th>${isClassification ? '<th>Accuracy</th><th>F1</th>' : '<th>R²</th><th>RMSE</th>'}<th>Status</th></tr></thead>
<tbody>${(mlResults.models || []).slice(0, 10).map((m, i) => `<tr><td>${i + 1}</td><td><strong>${m.type || m.name}</strong></td><td><span class="badge badge-info">${m.category || '-'}</span></td>${isClassification ? `<td>${(m.accuracy * 100)?.toFixed(1)}%</td><td>${(m.f1 * 100)?.toFixed(1)}%</td>` : `<td>${m.r2?.toFixed(4)}</td><td>${m.rmse?.toFixed(4)}</td>`}<td>${i === 0 ? '<span class="badge badge-success">🥇 Best</span>' : '<span class="badge">Trained</span>'}</td></tr>`).join('')}</tbody></table>`

            if (selectedMetrics && Object.keys(selectedMetrics).length > 0) {
                html += `<h3>Advanced Evaluation Metrics</h3><table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>
<tr><td>Accuracy</td><td>${formatValue(selectedMetrics.accuracy)}</td></tr>
<tr><td>Precision</td><td>${formatValue(selectedMetrics.precision)}</td></tr>
<tr><td>Recall</td><td>${formatValue(selectedMetrics.recall)}</td></tr>
<tr><td>F1 Score</td><td>${formatValue(selectedMetrics.f1)}</td></tr>
<tr><td>ROC-AUC</td><td>${formatValue(selectedMetrics.roc_auc)}</td></tr>
<tr><td>R²</td><td>${formatValue(selectedMetrics.r2)}</td></tr>
<tr><td>MAE</td><td>${formatValue(selectedMetrics.mae)}</td></tr>
<tr><td>MSE</td><td>${formatValue(selectedMetrics.mse)}</td></tr>
<tr><td>RMSE</td><td>${formatValue(selectedMetrics.rmse)}</td></tr>
<tr><td>Silhouette</td><td>${formatValue(selectedMetrics.silhouette)}</td></tr>
<tr><td>Inertia</td><td>${formatValue(selectedMetrics.inertia)}</td></tr>
<tr><td>Bias Level</td><td>${selectedMetrics.bias_level || '-'}</td></tr>
<tr><td>Variance Level</td><td>${selectedMetrics.variance_level || '-'}</td></tr>
</tbody></table>`

                if (selectedMetrics.roc_curve?.fpr?.length > 1 && selectedMetrics.roc_curve?.tpr?.length > 1) {
                    html += `<h3>ROC Curve</h3><div class="chart-card"><canvas id="rocCurveChart"></canvas></div>
<script>
new Chart(document.getElementById('rocCurveChart'), {
    type: 'line',
    data: {
        labels: ${JSON.stringify(selectedMetrics.roc_curve.fpr)},
        datasets: [{
            label: 'ROC',
            data: ${JSON.stringify(selectedMetrics.roc_curve.tpr)},
            borderColor: 'rgba(79,70,229,1)',
            backgroundColor: 'rgba(79,70,229,0.15)',
            fill: false,
            pointRadius: 0,
            tension: 0.2
        }]
    },
    options: {
        responsive: true,
        plugins: { title: { display: true, text: 'ROC Curve' } },
        scales: {
            x: { title: { display: true, text: 'False Positive Rate' }, min: 0, max: 1 },
            y: { title: { display: true, text: 'True Positive Rate' }, min: 0, max: 1 }
        }
    }
});
</script>`
                }
            }

            if (businessContext.metric) {
                const metricKey = businessContext.metric
                const targetValue = Number(businessContext.target)
                const direction = businessContext.direction || '>='
                const actual = Number(selectedMetrics?.[ metricKey ] ?? bestModel?.[ metricKey ])
                const hasActual = Number.isFinite(actual)
                const aligned = hasActual && (direction === '<=' ? actual <= targetValue : actual >= targetValue)
                html += `<h3>Business Alignment</h3><div class="insight ${aligned ? 'insight-success' : 'insight-warning'}"><strong>Target:</strong> ${metricKey} ${direction} ${formatValue(targetValue)} | <strong>Actual:</strong> ${hasActual ? formatValue(actual) : '-'} | <strong>Status:</strong> ${aligned ? 'Aligned' : 'Needs Improvement'}</div>`
            }

            if (isClustering) {
                html += `<div class="insight insight-info"><strong>Clustering Insight:</strong> Review silhouette and inertia jointly. Higher silhouette and lower inertia generally indicate better cluster separation and compactness.</div>`
            }

            // Feature Importance
            if (mlResults.featureImportance?.length > 0) {
                html += `<h3>Feature Importance (Top 10)</h3><table><thead><tr><th>Feature</th><th>Importance</th><th>Visual</th></tr></thead>
<tbody>${mlResults.featureImportance.slice(0, 10).map(f => `<tr><td>${f.feature}</td><td>${(f.importance * 100)?.toFixed(1)}%</td><td><div style="background:#e5e7eb;border-radius:4px;height:20px;width:200px"><div style="background:#7c3aed;height:100%;width:${f.importance * 100}%;border-radius:4px"></div></div></td></tr>`).join('')}</tbody></table>`
            }

            // ML Charts
            html += `<h3>Model Performance Visualization</h3>`

            // Model Comparison Chart
            const topModels = mlResults.models?.slice(0, 8) || []
            html += `<div class="chart-card"><h4>Model Performance Comparison</h4><canvas id="mlChart"></canvas></div>
<script>
new Chart(document.getElementById('mlChart'), {
    type: 'bar',
    data: {
        labels: ${JSON.stringify(topModels.map(m => m.type || m.name))},
        datasets: [{
            label: '${isClassification ? 'Accuracy (%)' : 'R² Score'}',
            data: ${JSON.stringify(topModels.map(m => isClassification ? (m.accuracy * 100) : m.r2))},
            backgroundColor: 'rgba(124, 58, 237, 0.7)',
            borderColor: 'rgb(124, 58, 237)',
            borderWidth: 1
        }${isClassification ? `, {
            label: 'F1 Score (%)',
            data: ${JSON.stringify(topModels.map(m => m.f1 * 100))},
            backgroundColor: 'rgba(236, 72, 153, 0.7)',
            borderColor: 'rgb(236, 72, 153)',
            borderWidth: 1
        }` : ''}]
    },
    options: {
        responsive: true,
        plugins: { title: { display: true, text: 'Model Performance Comparison' } },
        scales: { y: { beginAtZero: true${isClassification ? ', max: 100' : ''} } }
    }
});
</script>`

            // Feature Importance Chart
            if (mlResults.featureImportance?.length > 0) {
                const topFeatures = mlResults.featureImportance.slice(0, 10)
                html += `<div class="chart-card"><h4>Feature Importance</h4><canvas id="featureChart"></canvas></div>
<script>
new Chart(document.getElementById('featureChart'), {
    type: 'bar',
    data: {
        labels: ${JSON.stringify(topFeatures.map(f => f.feature))},
        datasets: [{
            label: 'Importance (%)',
            data: ${JSON.stringify(topFeatures.map(f => f.importance * 100))},
            backgroundColor: 'rgba(16, 185, 129, 0.7)',
            borderColor: 'rgb(16, 185, 129)',
            borderWidth: 1
        }]
    },
    options: {
        indexAxis: 'y',
        responsive: true,
        plugins: { title: { display: true, text: 'Feature Importance' } }
    }
});
</script>`
            }

            html += `</div>`
        }

        if (config.includeStatsMath && statsMathResults) {
            const hs = statsMathResults.hypothesis_testing || {}
            const ts = statsMathResults.time_series || {}
            const la = statsMathResults.linear_algebra || {}
            const bayes = statsMathResults.bayesian || {}
            const ab = statsMathResults.ab_test || {}
            const pVal = hs.t_test?.p_value ?? hs.anova?.p_value ?? hs.chi_square?.p_value

            html += `<h2>8. Statistics and Mathematics</h2><div class="section">
<div class="kpi-grid">
<div class="kpi"><div class="k">Probability Mean</div><div class="v">${formatValue(statsMathResults.probability?.mean, 3)}</div></div>
<div class="kpi"><div class="k">CI Lower</div><div class="v">${formatValue(statsMathResults.confidence_intervals?.lower, 3)}</div></div>
<div class="kpi"><div class="k">CI Upper</div><div class="v">${formatValue(statsMathResults.confidence_intervals?.upper, 3)}</div></div>
<div class="kpi"><div class="k">Top p-value</div><div class="v">${formatValue(pVal, 4)}</div></div>
<div class="kpi"><div class="k">P(Variant > Control)</div><div class="v">${formatValue(bayes.p_variant_gt_control, 4)}</div></div>
<div class="kpi"><div class="k">Matrix Rank</div><div class="v">${la.rank ?? '-'}</div></div>
</div>

<h3>Hypothesis Tests</h3><table><thead><tr><th>Test</th><th>Statistic</th><th>p-value</th><th>Interpretation (5%)</th></tr></thead><tbody>
<tr><td>T-test</td><td>${formatValue(hs.t_test?.t_statistic)}</td><td>${formatValue(hs.t_test?.p_value)}</td><td>${Number(hs.t_test?.p_value) < 0.05 ? 'Significant' : 'Not Significant'}</td></tr>
<tr><td>ANOVA</td><td>${formatValue(hs.anova?.f_statistic)}</td><td>${formatValue(hs.anova?.p_value)}</td><td>${Number(hs.anova?.p_value) < 0.05 ? 'Significant' : 'Not Significant'}</td></tr>
<tr><td>Chi-square</td><td>${formatValue(hs.chi_square?.chi2_statistic)}</td><td>${formatValue(hs.chi_square?.p_value)}</td><td>${Number(hs.chi_square?.p_value) < 0.05 ? 'Significant' : 'Not Significant'}</td></tr>
</tbody></table>

<h3>A/B and Bayesian Summary</h3><table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>
<tr><td>Control Rate</td><td>${formatValue(ab.control?.rate)}</td></tr>
<tr><td>Variant Rate</td><td>${formatValue(ab.variant?.rate)}</td></tr>
<tr><td>Absolute Lift</td><td>${formatValue(ab.absolute_lift)}</td></tr>
<tr><td>Relative Lift</td><td>${formatValue(ab.relative_lift)}</td></tr>
<tr><td>Z-test p-value</td><td>${formatValue(ab.p_value)}</td></tr>
<tr><td>Bayesian P(Variant > Control)</td><td>${formatValue(bayes.p_variant_gt_control)}</td></tr>
<tr><td>Expected Uplift</td><td>${formatValue(bayes.expected_uplift)}</td></tr>
</tbody></table>

<h3>Time Series Forecast</h3><table><thead><tr><th>Model</th><th>AIC</th><th>BIC</th><th>Forecast Points</th></tr></thead><tbody>
<tr><td>ARIMA</td><td>${formatValue(ts.arima?.aic)}</td><td>${formatValue(ts.arima?.bic)}</td><td>${Array.isArray(ts.arima?.forecast) ? ts.arima.forecast.length : 0}</td></tr>
<tr><td>SARIMA</td><td>${formatValue(ts.sarima?.aic)}</td><td>${formatValue(ts.sarima?.bic)}</td><td>${Array.isArray(ts.sarima?.forecast) ? ts.sarima.forecast.length : 0}</td></tr>
</tbody></table>

<h3>Linear Algebra Summary</h3><table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>
<tr><td>Matrix Shape</td><td>${Array.isArray(la.shape) ? la.shape.join(' x ') : '-'}</td></tr>
<tr><td>Rank</td><td>${la.rank ?? '-'}</td></tr>
<tr><td>Top Eigenvalue</td><td>${Array.isArray(la.eigenvalues) && la.eigenvalues.length ? formatValue(la.eigenvalues[ 0 ]) : '-'}</td></tr>
<tr><td>Top Singular Value</td><td>${Array.isArray(la.singular_values) && la.singular_values.length ? formatValue(la.singular_values[ 0 ]) : '-'}</td></tr>
<tr><td>Vector Dot Product</td><td>${formatValue(la.vector_analysis?.dot_product)}</td></tr>
<tr><td>Vector Cosine Similarity</td><td>${formatValue(la.vector_analysis?.cosine_similarity)}</td></tr>
</tbody></table>

${Array.isArray(statsMathResults.warnings) && statsMathResults.warnings.length > 0 ? `<h3>Analysis Warnings</h3>${statsMathResults.warnings.map(w => `<div class="insight insight-warning">${w}</div>`).join('')}` : ''}
</div>`
        }

        // Recommendations
        html += `<h2>9. Recommendations and Next Steps</h2><div class="section">`

        if (edaResults) {
            html += `<div class="insight ${edaResults.qualityScore >= 80 ? 'insight-success' : 'insight-warning'}"><strong>Data Quality:</strong> ${edaResults.qualityScore >= 80 ? 'Excellent data quality (' + edaResults.qualityScore + '/100). Ready for advanced modeling.' : 'Data quality score is ' + edaResults.qualityScore + '/100. Consider addressing missing values and outliers.'}</div>`
        }
        if (mlResults?.models?.[ 0 ]) {
            html += `<div class="insight insight-info"><strong>Model Recommendation:</strong> ${mlResults.models[ 0 ].type || mlResults.models[ 0 ].name} performed best. Consider hyperparameter tuning for further improvement.</div>`
        }
        if (statsMathResults?.ab_test?.p_value != null) {
            html += `<div class="insight insight-info"><strong>Experiment Recommendation:</strong> A/B test p-value is ${formatValue(statsMathResults.ab_test.p_value)}. ${Number(statsMathResults.ab_test.p_value) < 0.05 ? 'The uplift is statistically significant; consider rollout planning.' : 'Result is not statistically significant yet; increase sample size or duration.'}</div>`
        }

        html += `</div>
    <div class="footer"><p>Prepared by <strong>AI Data Science Research Assistant</strong></p><p>${now}</p></div>
</div></body></html>`
        return html
    }

    const downloadReport = (format) => {
        if (!reportData) return
        if (format === 'html') {
            const blob = new Blob([ reportData ], { type: 'text/html' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${dataset.name}_full_analysis_report.html`
            a.click()
            URL.revokeObjectURL(url)
        } else if (format === 'pdf') {
            const printWindow = window.open('', '_blank')
            printWindow.document.write(reportData)
            printWindow.document.close()
            setTimeout(() => printWindow.print(), 500)
        }
    }

    if (!dataset) {
        return (
            <div className="card text-center py-16">
                <FileText size={64} className="mx-auto text-gray-300 mb-4" />
                <h2 className="text-2xl font-bold text-gray-800 mb-2">No Dataset Loaded</h2>
                <p className="text-gray-500">Upload a dataset to generate reports</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="card hero-contrast bg-gradient-to-r from-blue-800 via-teal-700 to-orange-600 text-white">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="title-display mb-1 text-2xl font-bold">Comprehensive Report Generator</h1>
                        <p className="text-cyan-100">Generate full analysis reports with all insights & visualizations</p>
                    </div>
                    <button onClick={generateReport} disabled={generating} className="btn-secondary flex items-center gap-2 border-white/40 bg-white text-blue-700 hover:bg-white/90 disabled:opacity-70">
                        {generating ? <Loader size={18} className="animate-spin" /> : <FileText size={18} />}
                        {generating ? 'Generating...' : 'Generate Report'}
                    </button>
                </div>
            </div>

            {/* Analysis Status */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { key: 'eda', label: 'EDA', icon: BarChart3, data: edaResults, color: 'green', value: edaResults?.qualityScore ? `${edaResults.qualityScore}/100` : 'Not Run' },
                    { key: 'ml', label: 'ML', icon: Brain, data: mlResults, color: 'purple', value: mlResults?.models?.[ 0 ]?.type || 'Not Run' },
                    { key: 'stats', label: 'Stats & Math', icon: Sigma, data: statsMathResults, color: 'cyan', value: statsMathResults?.selected_columns?.numeric || 'Not Run' }
                ].map(item => {
                    const Icon = item.icon
                    const hasData = !!item.data
                    return (
                        <div key={item.key} className={`card ${hasData ? '' : 'opacity-60'}`}>
                            <div className="mb-2 flex items-center justify-between">
                                <Icon size={24} className={STATUS_ICON_CLASS[ item.color ] || 'text-slate-600'} />
                                {hasData ? <CheckCircle size={18} className="text-green-500" /> : <AlertCircle size={18} className="text-gray-400" />}
                            </div>
                            <p className={`text-lg font-bold ${hasData ? (STATUS_ICON_CLASS[ item.color ] || 'text-slate-700') : 'text-gray-400'}`}>{item.value}</p>
                            <p className="text-sm text-gray-500">{item.label} Analysis</p>
                        </div>
                    )
                })}
            </div>

            {!hasResults && (
                <div className="card bg-yellow-50 border-yellow-200">
                    <div className="flex items-center gap-3">
                        <AlertCircle size={24} className="text-yellow-600" />
                        <div>
                            <p className="font-semibold text-yellow-800">No Analysis Results Yet</p>
                            <p className="text-yellow-700 text-sm">Run analyses in Auto EDA or Auto ML pages first. Results will be included in the report.</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Configuration */}
            <div className="card">
                <h3 className="section-title mb-4 flex items-center gap-2"><Settings size={20} /> Report Sections</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                        { key: 'includeEDA', label: 'EDA Analysis', icon: BarChart3, hasData: !!edaResults },
                        { key: 'includeML', label: 'ML Results', icon: Brain, hasData: !!mlResults },
                        { key: 'includeStatsMath', label: 'Statistics & Math', icon: Sigma, hasData: !!statsMathResults },
                        { key: 'includeDataPreview', label: 'Data Preview', icon: Eye, hasData: true }
                    ].map(item => {
                        const Icon = item.icon
                        return (
                            <label key={item.key} className={`flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition ${config[ item.key ] ? 'border-blue-500 bg-blue-50' : 'border-gray-200'} ${!item.hasData ? 'opacity-50' : ''}`}>
                                <input type="checkbox" checked={config[ item.key ]} onChange={(e) => setConfig({ ...config, [ item.key ]: e.target.checked })} className="w-4 h-4" disabled={!item.hasData && item.key !== 'includeDataPreview'} />
                                <Icon size={16} />
                                <span className="text-sm">{item.label}</span>
                            </label>
                        )
                    })}
                </div>
            </div>

            {/* Report Preview */}
            {reportData && (
                <div className="card">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="section-title flex items-center gap-2"><CheckCircle size={20} className="text-green-600" /> Report Generated</h3>
                        <div className="flex gap-3">
                            <button onClick={() => downloadReport('html')} className="btn-primary flex items-center gap-2 px-4 py-2"><Download size={18} /> HTML</button>
                            <button onClick={() => downloadReport('pdf')} className="btn-danger flex items-center gap-2 px-4 py-2"><Download size={18} /> PDF</button>
                            <button onClick={generateReport} className="btn-secondary flex items-center gap-2 px-4 py-2"><RefreshCw size={18} /> Regenerate</button>
                        </div>
                    </div>
                    <div className="border rounded-lg overflow-hidden">
                        <div className="bg-gray-100 px-4 py-2 border-b flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-500"></div>
                            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                            <div className="w-3 h-3 rounded-full bg-green-500"></div>
                            <span className="ml-4 text-sm text-gray-600">Report Preview</span>
                        </div>
                        <iframe srcDoc={reportData} className="w-full h-[600px] border-0" title="Report Preview" />
                    </div>
                </div>
            )}

            {/* What's Included */}
            <div className="card">
                <h3 className="section-title mb-4">Report Contents</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                        { icon: '📁', title: 'Dataset Overview', items: [ 'Row/column counts', 'Data types', 'Data preview' ] },
                        { icon: '🔍', title: 'EDA Analysis', items: [ 'Quality score', 'Statistics', 'Missing data', 'Correlations', 'AI insights' ] },
                        { icon: '🤖', title: 'ML Results', items: [ 'Model comparison', 'Best model', 'Feature importance', 'Metrics' ] },
                        { icon: '📐', title: 'Statistics & Mathematics', items: [ 'Hypothesis tests', 'A/B + Bayesian', 'ARIMA/SARIMA', 'Linear algebra' ] },
                        { icon: '💡', title: 'Recommendations', items: [ 'Data quality tips', 'Model suggestions', 'Next steps' ] }
                    ].map((section, i) => (
                        <div key={i} className="flex gap-3 p-3 bg-gray-50 rounded-lg">
                            <span className="text-2xl">{section.icon}</span>
                            <div>
                                <p className="font-semibold">{section.title}</p>
                                <p className="text-xs text-gray-500">{section.items.join(' • ')}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default Reports
