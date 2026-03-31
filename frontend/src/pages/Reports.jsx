import React, { useState } from 'react'
import { FileText, Download, Loader, CheckCircle, AlertCircle, BarChart3, Brain, Sigma, Eye, Settings, RefreshCw } from 'lucide-react'
import { useAnalysis } from '../context/AnalysisContext'

function Reports({ dataset }) {
    const [ generating, setGenerating ] = useState(false)
    const [ reportData, setReportData ] = useState(null)
    const [ config, setConfig ] = useState({
        includeEDA: true, includeML: true, includeStatsMath: true, includeDataPreview: true,
        includeSubInsights: true, includeCategorical: true, includeStatsCharts: true
    })
    const { edaResults, mlResults, statsMathResults, hasResults } = useAnalysis()

    const generateReport = async () => {
        if (!dataset) return
        setGenerating(true)
        setTimeout(() => {
            try {
                setReportData(buildReport())
            } catch (err) {
                console.error('Report build error:', err)
                setReportData(`<html><body style="font-family:sans-serif;padding:2rem;color:#dc2626">
                    <h2>Report Generation Error</h2>
                    <pre style="background:#fef2f2;padding:1rem;border-radius:8px;overflow:auto">${err?.message || String(err)}</pre>
                    <p>Check the browser console for details.</p>
                </body></html>`)
            } finally {
                setGenerating(false)
            }
        }, 100)
    }

    const fv = (v, d = 4) => {
        if (v == null) return '—'
        const n = Number(v)
        return Number.isFinite(n) ? n.toFixed(d) : String(v)
    }
    const toN = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
    const pct = (v) => Number.isFinite(Number(v)) ? `${(Number(v) * 100).toFixed(1)}%` : '—'
    const sig = (p) => Number(p) < 0.05 ? '<span style="color:#0f9d58;font-weight:700">Significant ✓</span>' : '<span style="color:#888">Not Significant</span>'

    const buildReport = () => {
        const now = new Date().toLocaleString()
        const stats = edaResults?.statistics || []
        const corrs = [ ...(edaResults?.correlations || []) ].filter(c => Number.isFinite(c.correlation)).sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
        const missing = edaResults?.missingData || []
        const insights = edaResults?.insights || []
        const cats = edaResults?.categoricalAnalysis || []
        const recs = edaResults?.recommendations || []
        const trendIns = edaResults?.trendInsights || []
        const segIns = edaResults?.segmentationInsights || []
        const behIns = edaResults?.behavioralInsights || []
        const compIns = edaResults?.comparativeInsights || []
        const mlMetrics = mlResults?.metrics || {}
        const sm = statsMathResults || {}
        const hs = sm.hypothesis_testing || {}
        const ab = sm.ab_test || {}
        const bayes = sm.bayesian || {}
        const ts = sm.time_series || {}
        const la = sm.linear_algebra || {}

        // ── CSS ──────────────────────────────────────────────────────────────
        const css = `
*{margin:0;padding:0;box-sizing:border-box}
:root{--ink:#182433;--muted:#526274;--line:#d6dee8;--paper:#fff;--canvas:#f2f5f9;--brand:#0f5ea8;--brand2:#103a5d;--accent:#d99700;--ok:#0f9d58;--warn:#ef8f00;--danger:#d32f2f}
body{font-family:Georgia,'Times New Roman',serif;line-height:1.65;color:var(--ink);background:var(--canvas);padding:24px}
.report{max-width:1200px;margin:0 auto;background:var(--paper);border:1px solid var(--line);box-shadow:0 14px 36px rgba(16,27,41,.12)}
.cover{padding:46px 54px;background:linear-gradient(135deg,var(--brand2),var(--brand));color:#fff;border-bottom:6px solid var(--accent)}
.cover h1{font-size:2.2rem;margin-bottom:8px}
.cover p{opacity:.9;font-size:1rem}
.meta-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:18px}
.meta-card{background:rgba(255,255,255,.12);padding:12px;border:1px solid rgba(255,255,255,.2)}
.meta-card .lbl{font-size:.72rem;text-transform:uppercase;opacity:.8}
.meta-card .val{font-size:1.1rem;font-weight:700}
.content{padding:34px 42px}
h2{margin:28px 0 12px;border-bottom:2px solid var(--line);padding-bottom:8px;color:var(--brand2);font-size:1.4rem}
h3{margin:18px 0 10px;color:var(--brand);font-size:1.05rem}
h4{margin:10px 0 6px;color:var(--ink);font-size:.95rem;font-weight:700}
.toc{padding:14px 18px;border:1px solid var(--line);background:#fafcff;margin-bottom:8px}
.toc ol{margin-left:18px}.toc li{margin:3px 0;font-size:.93rem}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:12px 0}
.kpi{border:1px solid var(--line);padding:12px;background:#fff}
.kpi .k{font-size:.72rem;text-transform:uppercase;color:var(--muted)}
.kpi .v{font-size:1.45rem;font-weight:700;color:var(--brand2)}
.section{margin:20px 0;padding:16px;border:1px solid var(--line);background:#fbfcff}
table{width:100%;border-collapse:collapse;margin:10px 0;background:#fff;font-size:.88rem}
th,td{padding:8px 10px;text-align:left;border:1px solid var(--line);vertical-align:top}
th{background:#edf3fa;color:var(--brand2);font-weight:700}
tr:nth-child(even){background:#f8fbff}
.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:.72rem;font-weight:700}
.ok{background:#d9f4e7;color:#0b6f3d}.warn{background:#fff0cf;color:#925700}.bad{background:#ffe0df;color:#8f1f1f}.info{background:#e3eefb;color:#194a84}
.ins{padding:11px 14px;margin:7px 0;border-left:4px solid var(--brand);background:#f5f9ff;font-size:.9rem}
.ins.ok{background:#ecf9f2;border-color:var(--ok)}.ins.warn{background:#fff8ea;border-color:var(--warn)}.ins.info{background:#eef6ff;border-color:var(--brand)}
.chart-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:14px;margin:12px 0}
.chart-card{border:1px solid var(--line);background:#fff;padding:12px}
.chart-card canvas{width:100%!important;max-height:320px}
.full-chart{border:1px solid var(--line);background:#fff;padding:12px;margin:12px 0}
.full-chart canvas{width:100%!important}
.conf-badge{display:inline-block;padding:2px 7px;border-radius:10px;font-size:.7rem;font-weight:700}
.conf-high{background:#d9f4e7;color:#0b6f3d}.conf-med{background:#fff0cf;color:#925700}.conf-low{background:#f1f5f9;color:#64748b}
.bar-wrap{background:#e5e7eb;border-radius:4px;height:16px;width:180px;display:inline-block;vertical-align:middle}
.bar-fill{height:100%;border-radius:4px;background:#7c3aed}
.footer{margin-top:32px;padding-top:12px;border-top:1px solid var(--line);font-size:.85rem;color:var(--muted);text-align:center}
.break{page-break-before:always}
@media print{body{background:#fff;padding:0}.report{box-shadow:none;border:none}.section,.chart-card,.kpi,.toc{break-inside:avoid}}
`

        // ── TOC ──────────────────────────────────────────────────────────────
        const sections = [
            '1. Dataset Overview',
            config.includeEDA && edaResults ? '2. Data Quality & EDA Summary' : null,
            config.includeEDA && edaResults ? '3. Statistical Profiles (All Numeric)' : null,
            config.includeEDA && edaResults && corrs.length ? '4. Correlation Analysis & Scatter Charts' : null,
            config.includeEDA && edaResults && stats.length ? '5. Distribution Charts (All Features)' : null,
            config.includeEDA && edaResults && cats.length && config.includeCategorical ? '6. Categorical Analysis' : null,
            config.includeEDA && edaResults && insights.length ? '7. AI Insights' : null,
            config.includeEDA && edaResults && config.includeSubInsights ? '8. Trend · Segmentation · Behavioral · Comparative Insights' : null,
            config.includeEDA && edaResults && recs.length ? '9. EDA Recommendations' : null,
            config.includeML && mlResults ? '10. Machine Learning Results' : null,
            config.includeStatsMath && statsMathResults ? '11. Statistics & Mathematics' : null,
            config.includeStatsMath && statsMathResults && config.includeStatsCharts ? '12. Statistics Charts' : null,
            '13. Final Recommendations',
        ].filter(Boolean)

        // ── OPEN ─────────────────────────────────────────────────────────────
        let h = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Analysis Report — ${dataset.name}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"><\/script>
<style>${css}</style></head><body><div class="report">
<div class="cover">
  <h1>Professional Data Analysis Report</h1>
  <p>Complete exploratory analysis, statistical profiling, ML results, and actionable insights.</p>
  <div class="meta-grid">
    <div class="meta-card"><div class="lbl">Dataset</div><div class="val">${dataset.name}</div></div>
    <div class="meta-card"><div class="lbl">Rows × Cols</div><div class="val">${dataset.rowCount.toLocaleString()} × ${dataset.colCount}</div></div>
    <div class="meta-card"><div class="lbl">Quality Score</div><div class="val">${edaResults?.qualityScore != null ? edaResults.qualityScore + '/100' : '—'}</div></div>
    <div class="meta-card"><div class="lbl">Generated</div><div class="val">${now}</div></div>
  </div>
</div>
<div class="content">
<h2>Table of Contents</h2>
<div class="toc"><ol>${sections.map(s => `<li>${s}</li>`).join('')}</ol></div>`

        // ── 1. DATASET OVERVIEW ───────────────────────────────────────────────
        h += `<h2>1. Dataset Overview</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="k">Rows</div><div class="v">${dataset.rowCount.toLocaleString()}</div></div>
  <div class="kpi"><div class="k">Columns</div><div class="v">${dataset.colCount}</div></div>
  <div class="kpi"><div class="k">Numeric Cols</div><div class="v">${edaResults?.summary?.numericCols ?? '—'}</div></div>
  <div class="kpi"><div class="k">Categorical Cols</div><div class="v">${edaResults?.summary?.categoricalCols ?? '—'}</div></div>
  <div class="kpi"><div class="k">Missing Cells</div><div class="v">${edaResults?.summary?.missingTotal ?? '—'}</div></div>
  <div class="kpi"><div class="k">Duplicates</div><div class="v">${edaResults?.summary?.duplicateRows ?? '—'}</div></div>
  <div class="kpi"><div class="k">Outliers</div><div class="v">${edaResults?.summary?.outlierTotal ?? '—'}</div></div>
  <div class="kpi"><div class="k">Quality Score</div><div class="v" style="color:${(edaResults?.qualityScore ?? 0) >= 80 ? 'var(--ok)' : (edaResults?.qualityScore ?? 0) >= 60 ? 'var(--warn)' : 'var(--danger)'}">${edaResults?.qualityScore ?? '—'}/100</div></div>
</div>`

        if (config.includeDataPreview) {
            const cols = dataset.headers.slice(0, 10)
            h += `<h3>Data Preview (first 8 rows)</h3>
<table><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
<tbody>${dataset.rows.slice(0, 8).map(r => `<tr>${cols.map(c => `<td>${r[ c ] ?? '—'}</td>`).join('')}</tr>`).join('')}</tbody></table>`
        }

        // ── 2. EDA ────────────────────────────────────────────────────────────
        if (config.includeEDA && edaResults) {
            h += `<h2>2. Data Quality &amp; EDA Summary</h2><div class="section">
<h3>Missing Data</h3>
<table><thead><tr><th>Column</th><th>Missing</th><th>%</th><th>Status</th></tr></thead><tbody>
${missing.map(m => `<tr><td>${m.name}</td><td>${m.missing}</td><td>${fv(m.percentage, 1)}%</td><td><span class="badge ${parseFloat(m.percentage) === 0 ? 'ok' : parseFloat(m.percentage) < 10 ? 'warn' : 'bad'}">${parseFloat(m.percentage) === 0 ? 'Complete' : parseFloat(m.percentage) < 10 ? 'Low' : 'High'}</span></td></tr>`).join('')}
</tbody></table></div>`

            // ── 3. STATS ──────────────────────────────────────────────────────
            if (stats.length) {
                h += `<h2>3. Statistical Profiles (All Numeric Columns)</h2>
<table><thead><tr><th>Column</th><th>Mean</th><th>Median</th><th>Std</th><th>Min</th><th>Max</th><th>Q1</th><th>Q3</th><th>Outliers</th><th>Skewness</th><th>CV%</th><th>Trend</th></tr></thead><tbody>
${stats.map(s => `<tr>
  <td><strong>${s.name}</strong></td>
  <td>${fv(s.mean, 3)}</td><td>${fv(s.median, 3)}</td><td>${fv(s.std, 3)}</td>
  <td>${fv(s.min, 3)}</td><td>${fv(s.max, 3)}</td>
  <td>${fv(s.q1, 3)}</td><td>${fv(s.q3, 3)}</td>
  <td><span class="badge ${s.outlierCount > 0 ? 'warn' : 'ok'}">${s.outlierCount ?? 0}</span></td>
  <td>${fv(s.skewness, 3)}</td><td>${fv(s.cv, 1)}</td>
  <td>${s.trend ?? '—'}</td>
</tr>`).join('')}
</tbody></table>`
            }

            // ── 4. CORRELATIONS ───────────────────────────────────────────────
            if (corrs.length) {
                h += `<h2>4. Correlation Analysis</h2>
<table><thead><tr><th>#</th><th>Feature 1</th><th>Feature 2</th><th>r</th><th>Strength</th><th>Direction</th></tr></thead><tbody>
${corrs.map((c, i) => `<tr><td>${i + 1}</td><td>${c.feature1}</td><td>${c.feature2}</td>
  <td style="color:${c.correlation > 0 ? 'var(--ok)' : 'var(--danger)'}"><strong>${fv(c.correlation, 3)}</strong></td>
  <td><span class="badge info">${c.strength ?? '—'}</span></td>
  <td>${c.direction ?? (c.correlation > 0 ? 'Positive' : 'Negative')}</td></tr>`).join('')}
</tbody></table>

<h3>Correlation Bar Chart</h3>
<div class="full-chart"><canvas id="corrBar" style="height:${Math.max(300, corrs.length * 26)}px"></canvas></div>
<script>new Chart(document.getElementById('corrBar'),{type:'bar',data:{labels:${JSON.stringify(corrs.map(c => c.feature1 + ' vs ' + c.feature2))},datasets:[{label:'Correlation',data:${JSON.stringify(corrs.map(c => c.correlation))},backgroundColor:${JSON.stringify(corrs.map(c => c.correlation > 0 ? 'rgba(15,157,88,0.7)' : 'rgba(211,47,47,0.7)'))},borderWidth:1}]},options:{indexAxis:'y',responsive:true,plugins:{legend:{display:false}},scales:{x:{min:-1,max:1,title:{display:true,text:'Pearson r'}}}}})<\/script>

<h3>Scatter Charts (All Correlation Pairs)</h3>
<div class="chart-grid">
${corrs.map((c, i) => `<div class="chart-card"><h4>${c.feature1} vs ${c.feature2} (r=${fv(c.correlation, 3)})</h4><canvas id="sc${i}"></canvas></div>`).join('')}
</div>
<script>
${corrs.map((c, i) => `new Chart(document.getElementById('sc${i}'),{type:'scatter',data:{datasets:[{label:'${c.feature1} vs ${c.feature2}',data:${JSON.stringify((c.scatterData || []).map(p => ({ x: toN(p.x), y: toN(p.y) })))},pointRadius:2,pointBackgroundColor:'${c.correlation > 0 ? 'rgba(15,157,88,0.6)' : 'rgba(211,47,47,0.6)'}'}]},options:{responsive:true,plugins:{legend:{display:false},title:{display:true,text:'r=${fv(c.correlation, 3)} · ${c.strength ?? ''}'}},scales:{x:{title:{display:true,text:'${c.feature1}'}},y:{title:{display:true,text:'${c.feature2}'}}}}});`).join('\n')}
<\/script>`
            }

            // ── 5. DISTRIBUTIONS ──────────────────────────────────────────────
            if (stats.length) {
                h += `<h2 class="break">5. Distribution Charts (All Numeric Features)</h2>
<div class="chart-grid">
${stats.map((s, i) => `<div class="chart-card"><h4>${s.name}</h4><canvas id="dist${i}"></canvas></div>`).join('')}
</div>
<script>
${stats.map((s, i) => `new Chart(document.getElementById('dist${i}'),{type:'bar',data:{labels:${JSON.stringify((s.distribution || []).map(d => d.bin))},datasets:[{type:'bar',label:'Count',data:${JSON.stringify((s.distribution || []).map(d => toN(d.count)))},backgroundColor:'rgba(16,94,168,0.55)',borderWidth:1},{type:'line',label:'Shape',data:${JSON.stringify((s.distribution || []).map(d => toN(d.count)))},borderColor:'rgba(217,151,0,1)',tension:0.3,fill:false,pointRadius:0}]},options:{responsive:true,plugins:{title:{display:true,text:'${s.name} — mean:${fv(s.mean, 2)} std:${fv(s.std, 2)}'},legend:{display:false}},scales:{x:{ticks:{maxTicksLimit:8}},y:{beginAtZero:true}}}});`).join('\n')}
<\/script>`
            }

            // ── 6. CATEGORICAL ────────────────────────────────────────────────
            if (cats.length && config.includeCategorical) {
                h += `<h2>6. Categorical Analysis</h2>
<div class="chart-grid">
${cats.map((c, i) => `<div class="chart-card"><h4>${c.name} (${c.uniqueValues} unique · entropy ${fv(c.entropy, 2)})</h4><canvas id="cat${i}"></canvas></div>`).join('')}
</div>
<script>
${cats.map((c, i) => {
                    const top = (c.topValues || []).slice(0, 10)
                    return `new Chart(document.getElementById('cat${i}'),{type:'bar',data:{labels:${JSON.stringify(top.map(v => v.name))},datasets:[{label:'Count',data:${JSON.stringify(top.map(v => v.value))},backgroundColor:'rgba(99,102,241,0.7)',borderWidth:1}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}});`
                }).join('\n')}
<\/script>`
            }

            // ── 7. AI INSIGHTS ────────────────────────────────────────────────
            if (insights.length) {
                h += `<h2>7. AI Insights</h2>`
                insights.forEach(ins => {
                    const cls = ins.type === 'warning' ? 'warn' : ins.type === 'success' ? 'ok' : 'info'
                    h += `<div class="ins ${cls}"><strong>${ins.title}:</strong> ${ins.desc}${ins.action ? ` <em>→ ${ins.action}</em>` : ''}</div>`
                })
            }

            // ── 8. SUB-INSIGHTS ───────────────────────────────────────────────
            if (config.includeSubInsights && (trendIns.length || segIns.length || behIns.length || compIns.length)) {
                h += `<h2>8. Trend · Segmentation · Behavioral · Comparative Insights</h2>`
                const confBadge = (c) => `<span class="conf-badge ${c === 'High' || c === 'Very High' ? 'conf-high' : c === 'Medium' ? 'conf-med' : 'conf-low'}">${c}</span>`
                const renderGroup = (title, arr) => arr.length ? `<h3>${title}</h3>${arr.map(i => `<div class="ins info"><strong>${i.title}</strong> ${confBadge(i.confidence)}<br><span style="font-size:.88rem">${i.detail}</span></div>`).join('')}` : ''
                h += renderGroup('📈 Trend Insights', trendIns)
                h += renderGroup('🎯 Segmentation Insights', segIns)
                h += renderGroup('🧠 Behavioral Insights', behIns)
                h += renderGroup('⚖️ Comparative Insights', compIns)
            }

            // ── 9. RECOMMENDATIONS ────────────────────────────────────────────
            if (recs.length) {
                h += `<h2>9. EDA Recommendations</h2>`
                recs.forEach((r, i) => { h += `<div class="ins info"><strong>${i + 1}.</strong> ${r}</div>` })
            }
        }

        // ── 10. ML ────────────────────────────────────────────────────────────
        if (config.includeML && mlResults) {
            const best = mlResults.models?.[ 0 ]
            const isCls = String(mlResults.taskType || '').includes('classification')
            const isClust = String(mlResults.taskType || '').includes('clustering')
            const biz = mlResults.business_context || {}
            const topModels = (mlResults.models || []).slice(0, 10)
            const fi = mlResults.featureImportance || []

            h += `<h2 class="break">10. Machine Learning Results</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="k">Task Type</div><div class="v">${mlResults.taskType || '—'}</div></div>
  <div class="kpi"><div class="k">Models Trained</div><div class="v">${mlResults.models?.length ?? 0}</div></div>
  <div class="kpi"><div class="k">Best Model</div><div class="v" style="font-size:1rem">${best?.type || best?.name || '—'}</div></div>
  <div class="kpi"><div class="k">Training Time</div><div class="v">${mlResults.trainingTime != null ? mlResults.trainingTime.toFixed(2) + 's' : '—'}</div></div>
  ${isCls ? `<div class="kpi"><div class="k">Best Accuracy</div><div class="v" style="color:var(--ok)">${pct(best?.accuracy)}</div></div>
  <div class="kpi"><div class="k">Best F1</div><div class="v">${pct(best?.f1)}</div></div>` : ''}
  ${!isCls && !isClust ? `<div class="kpi"><div class="k">Best R²</div><div class="v" style="color:var(--ok)">${fv(best?.r2)}</div></div>
  <div class="kpi"><div class="k">Best RMSE</div><div class="v">${fv(best?.rmse)}</div></div>` : ''}
  ${isClust ? `<div class="kpi"><div class="k">Silhouette</div><div class="v">${fv(mlMetrics.silhouette)}</div></div>
  <div class="kpi"><div class="k">Inertia</div><div class="v">${fv(mlMetrics.inertia, 1)}</div></div>` : ''}
</div>

<h3>Model Comparison (Top 10)</h3>
<table><thead><tr><th>#</th><th>Model</th><th>Category</th>
${isCls ? '<th>Accuracy</th><th>Precision</th><th>Recall</th><th>F1</th>' : isClust ? '<th>Silhouette</th><th>Inertia</th>' : '<th>R²</th><th>MAE</th><th>RMSE</th>'}
<th>Rank</th></tr></thead><tbody>
${topModels.map((m, i) => `<tr>
  <td>${i + 1}</td><td><strong>${m.type || m.name}</strong></td>
  <td><span class="badge info">${m.category || '—'}</span></td>
  ${isCls ? `<td>${pct(m.accuracy)}</td><td>${pct(m.precision)}</td><td>${pct(m.recall)}</td><td>${pct(m.f1)}</td>` : isClust ? `<td>${fv(m.silhouette)}</td><td>${fv(m.inertia, 1)}</td>` : `<td>${fv(m.r2)}</td><td>${fv(m.mae)}</td><td>${fv(m.rmse)}</td>`}
  <td>${i === 0 ? '<span class="badge ok">🥇 Best</span>' : `<span class="badge info">#${i + 1}</span>`}</td>
</tr>`).join('')}
</tbody></table>

<h3>Advanced Metrics</h3>
<table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>
${[ [ 'Accuracy', mlMetrics.accuracy != null ? pct(mlMetrics.accuracy) : null ], [ 'Precision', mlMetrics.precision != null ? pct(mlMetrics.precision) : null ], [ 'Recall', mlMetrics.recall != null ? pct(mlMetrics.recall) : null ], [ 'F1 Score', mlMetrics.f1 != null ? pct(mlMetrics.f1) : null ], [ 'ROC-AUC', fv(mlMetrics.roc_auc) ], [ 'R²', fv(mlMetrics.r2) ], [ 'MAE', fv(mlMetrics.mae) ], [ 'MSE', fv(mlMetrics.mse) ], [ 'RMSE', fv(mlMetrics.rmse) ], [ 'Silhouette', fv(mlMetrics.silhouette) ], [ 'Inertia', fv(mlMetrics.inertia, 1) ], [ 'CV Mean', fv(mlMetrics.cv_mean) ], [ 'CV Std', fv(mlMetrics.cv_std) ], [ 'Bias Level', mlMetrics.bias_level || null ], [ 'Variance Level', mlMetrics.variance_level || null ] ].filter(([ , v ]) => v && v !== '—').map(([ k, v ]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}
</tbody></table>`

            if (biz.metric) {
                const actual = Number(mlMetrics[ biz.metric ] ?? best?.[ biz.metric ])
                const target = Number(biz.target)
                const aligned = biz.direction === '<=' ? actual <= target : actual >= target
                h += `<div class="ins ${aligned ? 'ok' : 'warn'}"><strong>Business Goal:</strong> ${biz.metric} ${biz.direction} ${fv(target)} | <strong>Actual:</strong> ${fv(actual)} | <strong>Status:</strong> ${aligned ? '✓ Aligned' : '✗ Needs Improvement'}</div>`
            }

            if (fi.length) {
                h += `<h3>Feature Importance (Top 15)</h3>
<table><thead><tr><th>Feature</th><th>Importance</th><th>Visual</th></tr></thead><tbody>
${fi.slice(0, 15).map(f => `<tr><td>${f.feature}</td><td>${pct(f.importance)}</td><td><div class="bar-wrap"><div class="bar-fill" style="width:${Math.min(100, f.importance * 100)}%"></div></div></td></tr>`).join('')}
</tbody></table>
<div class="chart-card"><h4>Feature Importance Chart</h4><canvas id="fiChart"></canvas></div>
<script>new Chart(document.getElementById('fiChart'),{type:'bar',data:{labels:${JSON.stringify(fi.slice(0, 15).map(f => f.feature))},datasets:[{label:'Importance',data:${JSON.stringify(fi.slice(0, 15).map(f => +(f.importance * 100).toFixed(2)))},backgroundColor:'rgba(16,185,129,0.7)',borderWidth:1}]},options:{indexAxis:'y',responsive:true,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,title:{display:true,text:'Importance (%)'}}}}})<\/script>`
            }

            h += `<h3>Model Performance Chart</h3>
<div class="chart-card"><canvas id="mlChart"></canvas></div>
<script>new Chart(document.getElementById('mlChart'),{type:'bar',data:{labels:${JSON.stringify(topModels.map(m => m.type || m.name))},datasets:[{label:'${isCls ? 'Accuracy (%)' : isClust ? 'Silhouette' : 'R²'}',data:${JSON.stringify(topModels.map(m => isCls ? +(((m.accuracy || 0) * 100).toFixed(1)) : isClust ? +(m.silhouette || 0).toFixed(4) : +(m.r2 || 0).toFixed(4)))},backgroundColor:'rgba(124,58,237,0.7)',borderWidth:1}${isCls ? `,{label:'F1 (%)',data:${JSON.stringify(topModels.map(m => +(((m.f1 || 0) * 100).toFixed(1))))},backgroundColor:'rgba(236,72,153,0.7)',borderWidth:1}` : ''}]},options:{responsive:true,plugins:{title:{display:true,text:'Model Comparison'}},scales:{y:{beginAtZero:true${isCls ? ',max:100' : ''}}}}})<\/script>`

            if (mlMetrics.roc_curve?.fpr?.length > 1) {
                h += `<h3>ROC Curve</h3><div class="chart-card"><canvas id="rocChart"></canvas></div>
<script>new Chart(document.getElementById('rocChart'),{type:'line',data:{labels:${JSON.stringify(mlMetrics.roc_curve.fpr)},datasets:[{label:'ROC',data:${JSON.stringify(mlMetrics.roc_curve.tpr)},borderColor:'rgba(79,70,229,1)',fill:false,pointRadius:0,tension:0.2},{label:'Baseline',data:${JSON.stringify(mlMetrics.roc_curve.fpr)},borderColor:'#ccc',borderDash:[5,5],fill:false,pointRadius:0}]},options:{responsive:true,plugins:{title:{display:true,text:'ROC Curve (AUC=${fv(mlMetrics.roc_auc)})'}},scales:{x:{title:{display:true,text:'FPR'},min:0,max:1},y:{title:{display:true,text:'TPR'},min:0,max:1}}}})<\/script>`
            }

            if (mlResults.confusion_matrix?.matrix?.length) {
                const cm = mlResults.confusion_matrix
                h += `<h3>Confusion Matrix</h3>
<table><thead><tr><th>Actual \\ Predicted</th>${(cm.labels || []).map(l => `<th>${l}</th>`).join('')}</tr></thead><tbody>
${cm.matrix.map((row, ri) => `<tr><td><strong>${(cm.labels || [])[ ri ] ?? ri}</strong></td>${row.map(v => `<td style="text-align:center">${v}</td>`).join('')}</tr>`).join('')}
</tbody></table>`
            }
        }

        // ── 11. STATS & MATH ──────────────────────────────────────────────────
        if (config.includeStatsMath && statsMathResults) {
            const pVal = hs.t_test?.p_value ?? hs.anova?.p_value ?? hs.chi_square?.p_value
            h += `<h2 class="break">11. Statistics &amp; Mathematics</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="k">Prob. Mean</div><div class="v">${fv(sm.probability?.mean, 3)}</div></div>
  <div class="kpi"><div class="k">CI Lower</div><div class="v">${fv(sm.confidence_intervals?.lower, 3)}</div></div>
  <div class="kpi"><div class="k">CI Upper</div><div class="v">${fv(sm.confidence_intervals?.upper, 3)}</div></div>
  <div class="kpi"><div class="k">Top p-value</div><div class="v">${fv(pVal, 4)}</div></div>
  <div class="kpi"><div class="k">P(Variant>Control)</div><div class="v">${fv(bayes.p_variant_gt_control, 4)}</div></div>
  <div class="kpi"><div class="k">Matrix Rank</div><div class="v">${la.rank ?? '—'}</div></div>
</div>

<h3>Hypothesis Tests</h3>
<table><thead><tr><th>Test</th><th>Statistic</th><th>p-value</th><th>Result (α=0.05)</th></tr></thead><tbody>
<tr><td>T-test (Welch)</td><td>${fv(hs.t_test?.t_statistic)}</td><td>${fv(hs.t_test?.p_value)}</td><td>${sig(hs.t_test?.p_value)}</td></tr>
<tr><td>ANOVA (F-test)</td><td>${fv(hs.anova?.f_statistic)}</td><td>${fv(hs.anova?.p_value)}</td><td>${sig(hs.anova?.p_value)}</td></tr>
<tr><td>Chi-square</td><td>${fv(hs.chi_square?.chi2_statistic)}</td><td>${fv(hs.chi_square?.p_value)}</td><td>${sig(hs.chi_square?.p_value)}</td></tr>
</tbody></table>

<h3>A/B Test &amp; Bayesian Analysis</h3>
<table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>
<tr><td>Control Rate</td><td>${fv(ab.control?.rate)}</td></tr>
<tr><td>Variant Rate</td><td>${fv(ab.variant?.rate)}</td></tr>
<tr><td>Absolute Lift</td><td>${fv(ab.absolute_lift)}</td></tr>
<tr><td>Relative Lift</td><td>${fv(ab.relative_lift)}</td></tr>
<tr><td>Z-test p-value</td><td>${fv(ab.p_value)}</td></tr>
<tr><td>Bayesian P(Variant > Control)</td><td>${fv(bayes.p_variant_gt_control)}</td></tr>
<tr><td>Expected Uplift</td><td>${fv(bayes.expected_uplift)}</td></tr>
</tbody></table>

<h3>Time Series Forecast</h3>
<table><thead><tr><th>Model</th><th>AIC</th><th>BIC</th><th>Forecast Points</th></tr></thead><tbody>
<tr><td>ARIMA</td><td>${fv(ts.arima?.aic)}</td><td>${fv(ts.arima?.bic)}</td><td>${Array.isArray(ts.arima?.forecast) ? ts.arima.forecast.length : 0}</td></tr>
<tr><td>SARIMA</td><td>${fv(ts.sarima?.aic)}</td><td>${fv(ts.sarima?.bic)}</td><td>${Array.isArray(ts.sarima?.forecast) ? ts.sarima.forecast.length : 0}</td></tr>
</tbody></table>

<h3>Linear Algebra</h3>
<table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>
<tr><td>Matrix Shape</td><td>${Array.isArray(la.shape) ? la.shape.join(' × ') : '—'}</td></tr>
<tr><td>Rank</td><td>${la.rank ?? '—'}</td></tr>
<tr><td>Top Eigenvalue</td><td>${Array.isArray(la.eigenvalues) && la.eigenvalues.length ? fv(la.eigenvalues[ 0 ]) : '—'}</td></tr>
<tr><td>Top Singular Value</td><td>${Array.isArray(la.singular_values) && la.singular_values.length ? fv(la.singular_values[ 0 ]) : '—'}</td></tr>
<tr><td>Vector Dot Product</td><td>${fv(la.vector_analysis?.dot_product)}</td></tr>
<tr><td>Vector Cosine Similarity</td><td>${fv(la.vector_analysis?.cosine_similarity)}</td></tr>
</tbody></table>
${Array.isArray(sm.warnings) && sm.warnings.length ? `<h3>Warnings</h3>${sm.warnings.map(w => `<div class="ins warn">${w}</div>`).join('')}` : ''}`

            // ── 12. STATS CHARTS ──────────────────────────────────────────────
            if (config.includeStatsCharts) {
                const arimaFc = ts.arima?.forecast || []
                const sarimaFc = ts.sarima?.forecast || []
                const maxFc = Math.max(arimaFc.length, sarimaFc.length)
                if (maxFc > 0) {
                    const fcLabels = Array.from({ length: maxFc }, (_, i) => `Step ${i + 1}`)
                    h += `<h2>12. Statistics Charts</h2>
<h3>Time Series Forecast</h3>
<div class="chart-card"><canvas id="fcChart"></canvas></div>
<script>new Chart(document.getElementById('fcChart'),{type:'line',data:{labels:${JSON.stringify(fcLabels)},datasets:[{label:'ARIMA',data:${JSON.stringify(arimaFc.map(v => toN(v)))},borderColor:'rgba(37,99,235,1)',fill:false,tension:0.3,pointRadius:2},{label:'SARIMA',data:${JSON.stringify(sarimaFc.map(v => toN(v)))},borderColor:'rgba(219,39,119,1)',fill:false,tension:0.3,pointRadius:2}]},options:{responsive:true,plugins:{title:{display:true,text:'ARIMA vs SARIMA Forecast'}}}})<\/script>`
                }
                if (ab.control && ab.variant) {
                    h += `<h3>A/B Test Conversion Rates</h3>
<div class="chart-card"><canvas id="abChart"></canvas></div>
<script>new Chart(document.getElementById('abChart'),{type:'bar',data:{labels:['Control','Variant'],datasets:[{label:'Conversion Rate',data:[${toN(ab.control.rate).toFixed(4)},${toN(ab.variant.rate).toFixed(4)}],backgroundColor:['rgba(37,99,235,0.7)','rgba(5,150,105,0.7)'],borderWidth:1}]},options:{responsive:true,plugins:{title:{display:true,text:'A/B Test Conversion Rates'}},scales:{y:{beginAtZero:true,max:1,title:{display:true,text:'Rate'}}}}})<\/script>`
                }
            }
        }

        // ── 13. FINAL RECOMMENDATIONS ─────────────────────────────────────────
        h += `<h2>13. Final Recommendations &amp; Next Steps</h2><div class="section">`
        if (edaResults) {
            const qs = edaResults.qualityScore ?? 0
            h += `<div class="ins ${qs >= 80 ? 'ok' : 'warn'}"><strong>Data Quality:</strong> Score is ${qs}/100. ${qs >= 80 ? 'Dataset is clean and ready for modelling.' : 'Address missing values and outliers before training.'}</div>`
            if ((edaResults.summary?.missingTotal ?? 0) > 0) h += `<div class="ins warn"><strong>Missing Values:</strong> ${edaResults.summary.missingTotal} missing cells detected. Use Data Cleaning → fill_mean or fill_median.</div>`
            if (corrs.some(c => Math.abs(c.correlation) > 0.9)) h += `<div class="ins warn"><strong>Multicollinearity:</strong> Very high correlations detected. Consider removing redundant features before ML training.</div>`
        }
        if (mlResults?.models?.[ 0 ]) {
            h += `<div class="ins info"><strong>Best Model:</strong> ${mlResults.models[ 0 ].type || mlResults.models[ 0 ].name} — consider hyperparameter tuning for further improvement.</div>`
        }
        if (statsMathResults?.ab_test?.p_value != null) {
            const abP = Number(statsMathResults.ab_test.p_value)
            h += `<div class="ins ${abP < 0.05 ? 'ok' : 'warn'}"><strong>A/B Test:</strong> p-value = ${fv(abP, 4)}. ${abP < 0.05 ? 'Statistically significant — consider rollout.' : 'Not significant yet — increase sample size.'}</div>`
        }
        h += `</div>`

        // ── CLOSE ─────────────────────────────────────────────────────────────
        h += `<div class="footer"><p>Generated by <strong>AI Data Science Research Assistant</strong> &nbsp;·&nbsp; ${now}</p></div>
</div></body></html>`
        return h
    }

    const downloadReport = (fmt) => {
        if (!reportData) return
        if (fmt === 'html') {
            const a = Object.assign(document.createElement('a'), {
                href: URL.createObjectURL(new Blob([ reportData ], { type: 'text/html' })),
                download: `${dataset.name}_report.html`
            })
            a.click(); URL.revokeObjectURL(a.href)
        } else {
            const w = window.open('', '_blank')
            w.document.write(reportData); w.document.close()
            setTimeout(() => w.print(), 600)
        }
    }

    if (!dataset) return (
        <div className="card py-16 text-center">
            <FileText size={64} className="mx-auto mb-4 text-slate-300" />
            <h2 className="mb-2 text-2xl font-bold text-slate-800">No Dataset Loaded</h2>
            <p className="text-slate-500">Upload a dataset to generate reports</p>
        </div>
    )

    return (
        <div className="space-y-6">
            <div className="card hero-contrast bg-gradient-to-r from-blue-800 via-teal-700 to-orange-600 text-white">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="title-display mb-1 text-2xl font-bold">Comprehensive Report Generator</h1>
                        <p className="text-cyan-100">Every insight, chart, and metric — in one downloadable report</p>
                    </div>
                    <button onClick={generateReport} disabled={generating}
                        className="btn-secondary flex items-center gap-2 border-white/40 bg-white text-blue-700 hover:bg-white/90 disabled:opacity-70">
                        {generating ? <Loader size={18} className="animate-spin" /> : <FileText size={18} />}
                        {generating ? 'Building...' : 'Generate Report'}
                    </button>
                </div>
            </div>

            {/* Status cards */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {[
                    { label: 'EDA', icon: BarChart3, data: edaResults, value: edaResults?.qualityScore != null ? `${edaResults.qualityScore}/100` : 'Not Run', color: 'text-green-600' },
                    { label: 'ML', icon: Brain, data: mlResults, value: mlResults?.models?.[ 0 ]?.type || 'Not Run', color: 'text-purple-600' },
                    { label: 'Stats & Math', icon: Sigma, data: statsMathResults, value: statsMathResults ? 'Ready' : 'Not Run', color: 'text-cyan-700' },
                    { label: 'Dataset', icon: Eye, data: dataset, value: `${dataset.rowCount} × ${dataset.colCount}`, color: 'text-blue-600' },
                ].map(({ label, icon: Icon, data, value, color }) => (
                    <div key={label} className={`card ${data ? '' : 'opacity-50'}`}>
                        <div className="mb-2 flex items-center justify-between">
                            <Icon size={22} className={color} />
                            {data ? <CheckCircle size={16} className="text-green-500" /> : <AlertCircle size={16} className="text-slate-400" />}
                        </div>
                        <p className={`text-base font-bold truncate ${color}`}>{value}</p>
                        <p className="text-xs text-slate-500">{label}</p>
                    </div>
                ))}
            </div>

            {!hasResults && (
                <div className="alert-warning">
                    <AlertCircle size={20} className="shrink-0" />
                    <div>
                        <p className="font-semibold">No Analysis Results Yet</p>
                        <p className="text-sm">Run Auto EDA, Auto ML, or Statistics first — results will be included automatically.</p>
                    </div>
                </div>
            )}

            {/* Config */}
            <div className="card">
                <h3 className="section-title mb-4 flex items-center gap-2"><Settings size={18} /> Report Sections</h3>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {[
                        { key: 'includeEDA', label: 'EDA Analysis', icon: BarChart3, ok: !!edaResults },
                        { key: 'includeSubInsights', label: 'Sub-Insights', icon: BarChart3, ok: !!edaResults },
                        { key: 'includeCategorical', label: 'Categorical Charts', icon: BarChart3, ok: !!edaResults },
                        { key: 'includeML', label: 'ML Results', icon: Brain, ok: !!mlResults },
                        { key: 'includeStatsMath', label: 'Stats & Math', icon: Sigma, ok: !!statsMathResults },
                        { key: 'includeStatsCharts', label: 'Stats Charts', icon: Sigma, ok: !!statsMathResults },
                        { key: 'includeDataPreview', label: 'Data Preview', icon: Eye, ok: true },
                    ].map(({ key, label, icon: Icon, ok }) => (
                        <label key={key} className={`flex cursor-pointer items-center gap-2 rounded-xl border-2 p-3 transition ${config[ key ] ? 'border-blue-500 bg-blue-50' : 'border-slate-200'} ${!ok ? 'opacity-40' : ''}`}>
                            <input type="checkbox" checked={config[ key ]} disabled={!ok && key !== 'includeDataPreview'}
                                onChange={e => setConfig(p => ({ ...p, [ key ]: e.target.checked }))} className="h-4 w-4" />
                            <Icon size={14} />
                            <span className="text-sm font-medium">{label}</span>
                        </label>
                    ))}
                </div>
            </div>

            {/* Preview */}
            {reportData && (
                <div className="card">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <h3 className="section-title flex items-center gap-2">
                            <CheckCircle size={20} className="text-green-600" /> Report Ready
                        </h3>
                        <div className="flex gap-2">
                            <button onClick={() => downloadReport('html')} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm"><Download size={16} /> HTML</button>
                            <button onClick={() => downloadReport('pdf')} className="btn-danger flex items-center gap-2 px-4 py-2 text-sm"><Download size={16} /> PDF / Print</button>
                            <button onClick={generateReport} className="btn-secondary flex items-center gap-2 px-4 py-2 text-sm"><RefreshCw size={16} /> Regenerate</button>
                        </div>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                        <div className="flex items-center gap-2 border-b bg-slate-100 px-4 py-2">
                            <div className="h-3 w-3 rounded-full bg-red-400" />
                            <div className="h-3 w-3 rounded-full bg-yellow-400" />
                            <div className="h-3 w-3 rounded-full bg-green-400" />
                            <span className="ml-3 text-xs text-slate-500">Report Preview</span>
                        </div>
                        <iframe srcDoc={reportData} className="h-[680px] w-full border-0" title="Report Preview" />
                    </div>
                </div>
            )}

            {/* Contents guide */}
            <div className="card">
                <h3 className="section-title mb-4">What's Included</h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {[
                        { e: '📁', t: 'Dataset Overview', d: 'Row/col counts, types, data preview' },
                        { e: '🔍', t: 'EDA & Data Quality', d: 'Quality score, missing data, outliers' },
                        { e: '📊', t: 'Statistical Profiles', d: 'Mean, median, std, Q1/Q3, skewness, CV' },
                        { e: '🔗', t: 'Correlation Analysis', d: 'All pairs, bar chart, scatter plots' },
                        { e: '📈', t: 'Distribution Charts', d: 'Histogram + curve for every numeric column' },
                        { e: '🏷️', t: 'Categorical Analysis', d: 'Top values, entropy, bar charts' },
                        { e: '💡', t: 'AI Insights', d: 'Auto-generated warnings, patterns, actions' },
                        { e: '🧠', t: 'Sub-Insights', d: 'Trend, segmentation, behavioral, comparative' },
                        { e: '🤖', t: 'ML Results', d: 'All models, metrics, feature importance, ROC' },
                        { e: '📐', t: 'Statistics & Math', d: 'Hypothesis tests, A/B, Bayesian, ARIMA' },
                        { e: '📉', t: 'Stats Charts', d: 'Forecast lines, A/B bar chart' },
                        { e: '✅', t: 'Recommendations', d: 'Data quality tips, model suggestions' },
                    ].map(({ e, t, d }) => (
                        <div key={t} className="flex gap-3 rounded-xl bg-slate-50 p-3">
                            <span className="text-xl">{e}</span>
                            <div><p className="text-sm font-semibold text-slate-800">{t}</p><p className="text-xs text-slate-500">{d}</p></div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default Reports
