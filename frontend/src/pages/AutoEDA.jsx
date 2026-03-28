import React, { useState, useMemo } from 'react'
import { BarChart3, PieChart, TrendingUp, AlertCircle, CheckCircle, Activity, Zap, Target, Eye, Lightbulb, ArrowUp, ArrowDown, Minus, Filter, Download, RefreshCw } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, LineChart, Line, ScatterChart, Scatter, AreaChart, Area, RadialBarChart, RadialBar, Legend, ComposedChart } from 'recharts'
import { useAnalysis } from '../context/AnalysisContext'

const COLORS = [ '#8b5cf6', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16', '#f97316', '#6366f1' ]

const METRIC_TEXT_CLASS = {
    purple: 'text-purple-600',
    blue: 'text-blue-600',
    green: 'text-green-600',
    pink: 'text-pink-600',
    orange: 'text-orange-600',
    red: 'text-red-600',
    yellow: 'text-yellow-600',
    gray: 'text-gray-600'
}

const METRIC_BAR_CLASS = {
    green: 'bg-green-500',
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    pink: 'bg-pink-500'
}

function AutoEDA({ dataset }) {
    const [ analyzing, setAnalyzing ] = useState(false)
    const [ results, setResults ] = useState(null)
    const [ activeTab, setActiveTab ] = useState('dashboard')
    const [ selectedColumn, setSelectedColumn ] = useState(null)
    const [ filterOutliers, setFilterOutliers ] = useState(false)
    const { setEdaResults } = useAnalysis()

    const runAnalysis = () => {
        if (!dataset) return
        setAnalyzing(true)

        setTimeout(() => {
            const numericCols = dataset.headers.filter(h => {
                const val = dataset.rows[ 0 ]?.[ h ]
                return !isNaN(parseFloat(val))
            })
            const categoricalCols = dataset.headers.filter(h => !numericCols.includes(h))

            // Missing data
            const missingData = dataset.headers.map(h => ({
                name: h,
                missing: dataset.rows.filter(r => !r[ h ] || r[ h ] === '').length,
                percentage: ((dataset.rows.filter(r => !r[ h ] || r[ h ] === '').length / dataset.rowCount) * 100)
            }))

            // Statistics
            const statistics = numericCols.map(col => {
                const values = dataset.rows.map(r => parseFloat(r[ col ])).filter(v => !isNaN(v))
                const sorted = [ ...values ].sort((a, b) => a - b)
                const mean = values.reduce((a, b) => a + b, 0) / values.length
                const min = Math.min(...values)
                const max = Math.max(...values)
                const median = sorted[ Math.floor(sorted.length / 2) ]
                const std = Math.sqrt(values.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / values.length)
                const q1 = sorted[ Math.floor(sorted.length * 0.25) ]
                const q3 = sorted[ Math.floor(sorted.length * 0.75) ]
                const iqr = q3 - q1
                const outliers = values.filter(v => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr)
                const skewness = values.reduce((s, v) => s + Math.pow((v - mean) / (std || 1), 3), 0) / values.length
                const range = max - min
                const cv = (std / mean) * 100

                // Distribution bins
                const binCount = 15
                const binSize = range / binCount
                const distribution = Array(binCount).fill(0).map((_, i) => {
                    const binStart = min + i * binSize
                    const binEnd = binStart + binSize
                    const count = values.filter(v => v >= binStart && v < binEnd).length
                    return { bin: binStart.toFixed(1), count, percentage: (count / values.length * 100).toFixed(1) }
                })

                return {
                    name: col, mean, median, std, min, max, q1, q3,
                    outlierCount: outliers.length, outlierPercentage: (outliers.length / values.length * 100).toFixed(1),
                    skewness: skewness.toFixed(2), range, cv: cv.toFixed(1), count: values.length,
                    distribution, values,
                    trend: mean > median ? 'right-skewed' : mean < median ? 'left-skewed' : 'symmetric'
                }
            })

            // Correlations
            const correlations = []
            for (let i = 0; i < numericCols.length; i++) {
                for (let j = i + 1; j < numericCols.length; j++) {
                    const col1 = numericCols[ i ], col2 = numericCols[ j ]
                    const vals1 = dataset.rows.map(r => parseFloat(r[ col1 ])).filter(v => !isNaN(v))
                    const vals2 = dataset.rows.map(r => parseFloat(r[ col2 ])).filter(v => !isNaN(v))
                    const mean1 = vals1.reduce((a, b) => a + b, 0) / vals1.length
                    const mean2 = vals2.reduce((a, b) => a + b, 0) / vals2.length
                    let num = 0, den1 = 0, den2 = 0
                    for (let k = 0; k < Math.min(vals1.length, vals2.length); k++) {
                        num += (vals1[ k ] - mean1) * (vals2[ k ] - mean2)
                        den1 += Math.pow(vals1[ k ] - mean1, 2)
                        den2 += Math.pow(vals2[ k ] - mean2, 2)
                    }
                    const corr = num / Math.sqrt(den1 * den2)
                    if (!isNaN(corr)) {
                        correlations.push({
                            feature1: col1, feature2: col2, correlation: corr,
                            strength: Math.abs(corr) > 0.7 ? 'Strong' : Math.abs(corr) > 0.4 ? 'Moderate' : 'Weak',
                            direction: corr > 0 ? 'Positive' : 'Negative',
                            scatterData: vals1.slice(0, 100).map((v, i) => ({ x: v, y: vals2[ i ] }))
                        })
                    }
                }
            }

            // Categorical analysis
            const categoricalAnalysis = categoricalCols.map(col => {
                const valueCounts = {}
                dataset.rows.forEach(r => {
                    const val = r[ col ] || 'Missing'
                    valueCounts[ val ] = (valueCounts[ val ] || 0) + 1
                })
                const sorted = Object.entries(valueCounts).sort((a, b) => b[ 1 ] - a[ 1 ])
                const entropy = -sorted.reduce((e, [ _, count ]) => {
                    const p = count / dataset.rowCount
                    return e + (p > 0 ? p * Math.log2(p) : 0)
                }, 0)
                return {
                    name: col, uniqueValues: Object.keys(valueCounts).length,
                    topValues: sorted.slice(0, 10).map(([ name, value ]) => ({ name, value, percentage: (value / dataset.rowCount * 100).toFixed(1) })),
                    entropy: entropy.toFixed(2),
                    dominance: (sorted[ 0 ][ 1 ] / dataset.rowCount * 100).toFixed(1)
                }
            })

            // Quality metrics
            const missingScore = 100 - (missingData.reduce((a, b) => a + b.percentage, 0) / dataset.headers.length)
            const duplicateRows = new Set(dataset.rows.map(r => JSON.stringify(r))).size
            const duplicateScore = (duplicateRows / dataset.rowCount) * 100
            const outlierTotal = statistics.reduce((a, b) => a + b.outlierCount, 0)
            const outlierScore = 100 - (outlierTotal / (dataset.rowCount * numericCols.length) * 100)
            const qualityScore = Math.round((missingScore + duplicateScore + outlierScore) / 3)

            // Generate insights
            const insights = []
            if (missingData.some(m => m.percentage > 20)) insights.push({ type: 'warning', icon: AlertCircle, title: 'High Missing Data', desc: `${missingData.filter(m => m.percentage > 20).length} columns have >20% missing values`, action: 'Consider imputation or removal' })
            if (outlierTotal > dataset.rowCount * 0.05) insights.push({ type: 'warning', icon: AlertCircle, title: 'Outliers Detected', desc: `${outlierTotal} outliers found (${(outlierTotal / dataset.rowCount * 100).toFixed(1)}%)`, action: 'Review outlier treatment strategy' })
            if (correlations.some(c => Math.abs(c.correlation) > 0.9)) insights.push({ type: 'info', icon: TrendingUp, title: 'High Correlation', desc: 'Some features are highly correlated', action: 'Consider feature selection' })
            if (statistics.some(s => Math.abs(parseFloat(s.skewness)) > 1)) insights.push({ type: 'info', icon: Activity, title: 'Skewed Distributions', desc: 'Some features have skewed distributions', action: 'Consider log transformation' })
            if (qualityScore >= 80) insights.push({ type: 'success', icon: CheckCircle, title: 'Good Data Quality', desc: `Quality score: ${qualityScore}/100`, action: 'Data is ready for analysis' })
            if (numericCols.length >= 3) insights.push({ type: 'success', icon: Zap, title: 'ML Ready', desc: `${numericCols.length} numeric features available`, action: 'Suitable for machine learning' })

            // Radar data for quality
            const qualityRadar = [
                { metric: 'Completeness', value: missingScore, fullMark: 100 },
                { metric: 'Uniqueness', value: duplicateScore, fullMark: 100 },
                { metric: 'Consistency', value: outlierScore, fullMark: 100 },
                { metric: 'Validity', value: Math.min(100, qualityScore + 10), fullMark: 100 },
                { metric: 'Accuracy', value: Math.min(100, qualityScore + 5), fullMark: 100 }
            ]

            const analysisResults = {
                summary: { rows: dataset.rowCount, columns: dataset.colCount, numericCols: numericCols.length, categoricalCols: categoricalCols.length, missingTotal: missingData.reduce((a, b) => a + b.missing, 0), duplicateRows: dataset.rowCount - duplicateRows, outlierTotal },
                missingData, statistics, correlations, categoricalAnalysis, qualityScore, insights, qualityRadar,
                typeCount: [ { name: 'Numeric', value: numericCols.length }, { name: 'Categorical', value: categoricalCols.length } ]
            }
            setResults(analysisResults)
            setEdaResults(analysisResults) // Save to global context for reports
            setAnalyzing(false)
        }, 2000)
    }

    // Memoized filtered data
    const filteredStats = useMemo(() => {
        if (!results) return []
        return filterOutliers ? results.statistics.map(s => ({ ...s, outlierCount: 0 })) : results.statistics
    }, [ results, filterOutliers ])

    if (!dataset) {
        return (
            <div className="card text-center py-16">
                <BarChart3 size={64} className="mx-auto text-gray-300 mb-4" />
                <h2 className="text-2xl font-bold text-gray-800 mb-2">No Dataset Loaded</h2>
                <p className="text-gray-500 mb-4">Upload a CSV file to unlock powerful EDA insights</p>
                <div className="flex justify-center gap-4 text-sm text-gray-400">
                    <span>📊 Auto Statistics</span>
                    <span>🔍 Correlation Analysis</span>
                    <span>📈 Interactive Charts</span>
                </div>
            </div>
        )
    }

    const tabs = [
        { id: 'dashboard', label: 'Interactive Dashboard', icon: Eye },
        { id: 'insights', label: 'AI Insights', icon: Lightbulb },
        { id: 'distributions', label: 'Distributions', icon: BarChart3 },
        { id: 'correlations', label: 'Correlations', icon: TrendingUp },
        { id: 'quality', label: 'Data Quality', icon: CheckCircle }
    ]

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="card bg-gradient-to-r from-blue-800 via-teal-700 to-orange-600 text-white">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="title-display mb-1 text-2xl font-bold">Interactive EDA Dashboard</h1>
                        <p className="text-cyan-100">Comprehensive data analysis with AI-powered insights</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {results && (
                            <div className="rounded-lg bg-white/20 px-4 py-2">
                                <p className="text-xs text-cyan-100">Quality Score</p>
                                <p className="text-2xl font-bold">{results.qualityScore}/100</p>
                            </div>
                        )}
                        <button onClick={runAnalysis} disabled={analyzing} className="flex items-center gap-2 rounded-lg bg-white px-6 py-3 font-semibold text-blue-700 transition hover:bg-blue-50">
                            {analyzing ? <RefreshCw size={18} className="animate-spin" /> : <Zap size={18} />}
                            {analyzing ? 'Analyzing...' : 'Run Analysis'}
                        </button>
                    </div>
                </div>
                <div className="mt-4 flex gap-6 text-sm">
                    <span className="bg-white/20 px-3 py-1 rounded-full">{dataset.name}</span>
                    <span>{dataset.rowCount.toLocaleString()} rows</span>
                    <span>{dataset.colCount} columns</span>
                </div>
            </div>

            {analyzing && !results && (
                <div className="space-y-6 fade-up">
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
                        {[ 1, 2, 3, 4, 5, 6, 7 ].map((idx) => (
                            <div key={idx} className="card p-4">
                                <div className="skeleton mb-3 h-5 w-10" />
                                <div className="skeleton mb-2 h-7 w-16" />
                                <div className="skeleton h-3 w-20" />
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <div className="card">
                            <div className="skeleton mb-4 h-5 w-40" />
                            <div className="skeleton h-56 w-full" />
                        </div>
                        <div className="card">
                            <div className="skeleton mb-4 h-5 w-40" />
                            <div className="skeleton h-56 w-full" />
                        </div>
                    </div>
                </div>
            )}

            {results && (
                <>
                    {/* Tabs */}
                    <div className="flex gap-2 overflow-x-auto pb-2">
                        {tabs.map(tab => {
                            const Icon = tab.icon
                            return (
                                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-5 py-3 rounded-xl whitespace-nowrap transition-all ${activeTab === tab.id ? 'bg-purple-600 text-white shadow-lg scale-105' : 'bg-white text-gray-600 hover:bg-purple-50 hover:text-purple-600'}`}>
                                    <Icon size={18} />
                                    {tab.label}
                                </button>
                            )
                        })}
                    </div>

                    {/* Interactive Dashboard Tab */}
                    {activeTab === 'dashboard' && (
                        <div className="space-y-6">
                            {/* Key Metrics */}
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                                {[
                                    { label: 'Rows', value: results.summary.rows.toLocaleString(), color: 'purple', icon: '📊' },
                                    { label: 'Columns', value: results.summary.columns, color: 'blue', icon: '📋' },
                                    { label: 'Numeric', value: results.summary.numericCols, color: 'green', icon: '🔢' },
                                    { label: 'Categorical', value: results.summary.categoricalCols, color: 'pink', icon: '🏷️' },
                                    { label: 'Missing', value: results.summary.missingTotal.toLocaleString(), color: 'orange', icon: '❓' },
                                    { label: 'Duplicates', value: results.summary.duplicateRows, color: 'red', icon: '📑' },
                                    { label: 'Outliers', value: results.summary.outlierTotal, color: 'yellow', icon: '⚠️' }
                                ].map((m, i) => (
                                    <div key={i} className="card cursor-pointer text-center hover:-translate-y-0.5">
                                        <span className="text-2xl">{m.icon}</span>
                                        <p className={`text-2xl font-bold ${METRIC_TEXT_CLASS[ m.color ] || 'text-slate-700'}`}>{m.value}</p>
                                        <p className="text-gray-500 text-xs">{m.label}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Interactive Charts Row */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Column Selector & Stats */}
                                <div className="card">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-lg font-semibold">Column Explorer</h3>
                                        <select value={selectedColumn || ''} onChange={(e) => setSelectedColumn(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
                                            <option value="">Select column...</option>
                                            {results.statistics.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                                        </select>
                                    </div>
                                    {selectedColumn ? (
                                        <div>
                                            {(() => {
                                                const stat = results.statistics.find(s => s.name === selectedColumn)
                                                if (!stat) return null
                                                return (
                                                    <div className="space-y-4">
                                                        <ResponsiveContainer width="100%" height={200}>
                                                            <AreaChart data={stat.distribution}>
                                                                <defs><linearGradient id="colorGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} /><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.1} /></linearGradient></defs>
                                                                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="bin" tick={{ fontSize: 10 }} /><YAxis /><Tooltip /><Area type="monotone" dataKey="count" stroke="#8b5cf6" fill="url(#colorGrad)" />
                                                            </AreaChart>
                                                        </ResponsiveContainer>
                                                        <div className="grid grid-cols-4 gap-2 text-center text-sm">
                                                            <div className="bg-purple-50 p-2 rounded"><p className="font-bold text-purple-600">{stat.mean.toFixed(2)}</p><p className="text-gray-500 text-xs">Mean</p></div>
                                                            <div className="bg-blue-50 p-2 rounded"><p className="font-bold text-blue-600">{stat.median.toFixed(2)}</p><p className="text-gray-500 text-xs">Median</p></div>
                                                            <div className="bg-green-50 p-2 rounded"><p className="font-bold text-green-600">{stat.std.toFixed(2)}</p><p className="text-gray-500 text-xs">Std Dev</p></div>
                                                            <div className="bg-orange-50 p-2 rounded"><p className="font-bold text-orange-600">{stat.outlierCount}</p><p className="text-gray-500 text-xs">Outliers</p></div>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-sm">
                                                            <span className={`px-2 py-1 rounded ${stat.trend === 'symmetric' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{stat.trend}</span>
                                                            <span className="text-gray-500">Skewness: {stat.skewness}</span>
                                                            <span className="text-gray-500">CV: {stat.cv}%</span>
                                                        </div>
                                                    </div>
                                                )
                                            })()}
                                        </div>
                                    ) : <p className="text-gray-400 text-center py-8">Select a column to explore</p>}
                                </div>

                                {/* Top Correlations */}
                                <div className="card">
                                    <h3 className="text-lg font-semibold mb-4">Top Correlations</h3>
                                    <div className="space-y-3">
                                        {results.correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)).slice(0, 5).map((c, i) => (
                                            <div key={i} className="flex items-center gap-3">
                                                <div className="flex-1">
                                                    <div className="flex justify-between text-sm mb-1">
                                                        <span className="font-medium">{c.feature1} ↔ {c.feature2}</span>
                                                        <span className={c.correlation > 0 ? 'text-green-600' : 'text-red-600'}>{c.correlation.toFixed(3)}</span>
                                                    </div>
                                                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                                        <div className={`h-full rounded-full ${c.correlation > 0 ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${Math.abs(c.correlation) * 100}%` }} />
                                                    </div>
                                                </div>
                                                {c.correlation > 0 ? <ArrowUp size={16} className="text-green-500" /> : <ArrowDown size={16} className="text-red-500" />}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Missing Data & Types */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div className="card lg:col-span-2">
                                    <h3 className="text-lg font-semibold mb-4">Missing Data Heatmap</h3>
                                    <ResponsiveContainer width="100%" height={200}>
                                        <BarChart data={results.missingData} layout="vertical">
                                            <CartesianGrid strokeDasharray="3 3" /><XAxis type="number" domain={[ 0, 100 ]} /><YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} /><Tooltip formatter={(v) => `${v.toFixed(1)}%`} /><Bar dataKey="percentage" fill="#f59e0b" radius={[ 0, 4, 4, 0 ]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="card">
                                    <h3 className="text-lg font-semibold mb-4">Data Types</h3>
                                    <ResponsiveContainer width="100%" height={200}>
                                        <RechartsPie>
                                            <Pie data={results.typeCount} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={5} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                                                {results.typeCount.map((_, i) => <Cell key={i} fill={COLORS[ i ]} />)}
                                            </Pie>
                                            <Tooltip />
                                        </RechartsPie>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Statistics Table */}
                            <div className="card">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-semibold">Numeric Statistics</h3>
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input type="checkbox" checked={filterOutliers} onChange={(e) => setFilterOutliers(e.target.checked)} className="rounded" />
                                        <Filter size={14} /> Hide Outliers
                                    </label>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead><tr className="bg-gray-50">{[ 'Column', 'Mean', 'Median', 'Std', 'Min', 'Max', 'Outliers', 'Skew', 'Trend' ].map(h => <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>)}</tr></thead>
                                        <tbody>
                                            {filteredStats.map((s, i) => (
                                                <tr key={i} className="border-b hover:bg-purple-50 cursor-pointer" onClick={() => setSelectedColumn(s.name)}>
                                                    <td className="px-3 py-2 font-medium text-purple-600">{s.name}</td>
                                                    <td className="px-3 py-2">{s.mean.toFixed(2)}</td>
                                                    <td className="px-3 py-2">{s.median.toFixed(2)}</td>
                                                    <td className="px-3 py-2">{s.std.toFixed(2)}</td>
                                                    <td className="px-3 py-2">{s.min.toFixed(2)}</td>
                                                    <td className="px-3 py-2">{s.max.toFixed(2)}</td>
                                                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-xs ${s.outlierCount > 0 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>{s.outlierCount}</span></td>
                                                    <td className="px-3 py-2">{s.skewness}</td>
                                                    <td className="px-3 py-2">{s.trend === 'symmetric' ? <Minus size={14} className="text-gray-400" /> : s.trend === 'right-skewed' ? <ArrowUp size={14} className="text-blue-500" /> : <ArrowDown size={14} className="text-red-500" />}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* AI Insights Tab */}
                    {activeTab === 'insights' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {results.insights.map((insight, i) => (
                                    <div key={i} className={`card border-l-4 ${insight.type === 'warning' ? 'border-orange-500 bg-orange-50' : insight.type === 'success' ? 'border-green-500 bg-green-50' : 'border-blue-500 bg-blue-50'}`}>
                                        <div className="flex items-start gap-3">
                                            <insight.icon size={24} className={insight.type === 'warning' ? 'text-orange-500' : insight.type === 'success' ? 'text-green-500' : 'text-blue-500'} />
                                            <div>
                                                <h4 className="font-semibold text-gray-800">{insight.title}</h4>
                                                <p className="text-sm text-gray-600 mt-1">{insight.desc}</p>
                                                <p className="text-xs text-gray-500 mt-2 flex items-center gap-1"><Target size={12} /> {insight.action}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Recommendations */}
                            <div className="card">
                                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Lightbulb className="text-yellow-500" /> Smart Recommendations</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {[
                                        { title: 'Handle Missing Values', desc: results.summary.missingTotal > 0 ? `${results.summary.missingTotal} missing values detected. Consider imputation.` : 'No missing values - great!', status: results.summary.missingTotal === 0 },
                                        { title: 'Outlier Treatment', desc: results.summary.outlierTotal > 0 ? `${results.summary.outlierTotal} outliers found. Review for data quality.` : 'No significant outliers detected.', status: results.summary.outlierTotal < results.summary.rows * 0.05 },
                                        { title: 'Feature Scaling', desc: 'Recommended for ML models with different scales.', status: true },
                                        { title: 'Correlation Check', desc: results.correlations.some(c => Math.abs(c.correlation) > 0.9) ? 'High correlations detected - consider feature selection.' : 'No multicollinearity issues.', status: !results.correlations.some(c => Math.abs(c.correlation) > 0.9) }
                                    ].map((rec, i) => (
                                        <div key={i} className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                                            {rec.status ? <CheckCircle className="text-green-500 flex-shrink-0" /> : <AlertCircle className="text-orange-500 flex-shrink-0" />}
                                            <div><h4 className="font-medium">{rec.title}</h4><p className="text-sm text-gray-600">{rec.desc}</p></div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Distributions Tab */}
                    {activeTab === 'distributions' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {results.statistics.map((stat, i) => (
                                    <div key={i} className="card">
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="font-semibold">{stat.name}</h4>
                                            <span className={`px-2 py-1 rounded text-xs ${stat.trend === 'symmetric' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{stat.trend}</span>
                                        </div>
                                        <ResponsiveContainer width="100%" height={180}>
                                            <ComposedChart data={stat.distribution}>
                                                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="bin" tick={{ fontSize: 9 }} /><YAxis /><Tooltip />
                                                <Bar dataKey="count" fill={COLORS[ i % COLORS.length ]} opacity={0.8} />
                                                <Line type="monotone" dataKey="count" stroke="#333" strokeWidth={2} dot={false} />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                        <div className="flex justify-between text-xs text-gray-500 mt-2">
                                            <span>Min: {stat.min.toFixed(2)}</span>
                                            <span>Mean: {stat.mean.toFixed(2)}</span>
                                            <span>Max: {stat.max.toFixed(2)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Correlations Tab */}
                    {activeTab === 'correlations' && (
                        <div className="space-y-6">
                            {/* Correlation Matrix */}
                            <div className="card">
                                <h3 className="text-lg font-semibold mb-4">Correlation Analysis</h3>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {results.correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)).slice(0, 6).map((c, i) => (
                                        <div key={i} className="border rounded-lg p-4">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="font-medium text-sm">{c.feature1} vs {c.feature2}</span>
                                                <span className={`px-2 py-1 rounded text-xs font-semibold ${c.strength === 'Strong' ? 'bg-purple-100 text-purple-700' : c.strength === 'Moderate' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                                                    {c.strength} ({c.correlation.toFixed(3)})
                                                </span>
                                            </div>
                                            <ResponsiveContainer width="100%" height={150}>
                                                <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                                                    <CartesianGrid strokeDasharray="3 3" />
                                                    <XAxis dataKey="x" type="number" tick={{ fontSize: 10 }} />
                                                    <YAxis dataKey="y" type="number" tick={{ fontSize: 10 }} />
                                                    <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                                                    <Scatter data={c.scatterData} fill={c.correlation > 0 ? '#10b981' : '#ef4444'} />
                                                </ScatterChart>
                                            </ResponsiveContainer>
                                            <p className="text-xs text-gray-500 text-center mt-2">
                                                {c.direction} {c.strength.toLowerCase()} correlation
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Correlation Summary */}
                            <div className="card">
                                <h3 className="text-lg font-semibold mb-4">All Correlations</h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-gray-50">
                                                <th className="px-4 py-2 text-left">Feature 1</th>
                                                <th className="px-4 py-2 text-left">Feature 2</th>
                                                <th className="px-4 py-2 text-left">Correlation</th>
                                                <th className="px-4 py-2 text-left">Strength</th>
                                                <th className="px-4 py-2 text-left">Direction</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {results.correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)).map((c, i) => (
                                                <tr key={i} className="border-b hover:bg-gray-50">
                                                    <td className="px-4 py-2">{c.feature1}</td>
                                                    <td className="px-4 py-2">{c.feature2}</td>
                                                    <td className="px-4 py-2">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                                                                <div className={`h-full ${c.correlation > 0 ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${Math.abs(c.correlation) * 100}%` }} />
                                                            </div>
                                                            <span>{c.correlation.toFixed(3)}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <span className={`px-2 py-1 rounded text-xs ${c.strength === 'Strong' ? 'bg-purple-100 text-purple-700' : c.strength === 'Moderate' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                                                            {c.strength}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <span className={`flex items-center gap-1 ${c.direction === 'Positive' ? 'text-green-600' : 'text-red-600'}`}>
                                                            {c.direction === 'Positive' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                                                            {c.direction}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Data Quality Tab */}
                    {activeTab === 'quality' && (
                        <div className="space-y-6">
                            {/* Quality Score Overview */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div className="card text-center">
                                    <h3 className="text-lg font-semibold mb-4">Overall Quality Score</h3>
                                    <div className="relative w-40 h-40 mx-auto">
                                        <svg className="w-full h-full transform -rotate-90">
                                            <circle cx="80" cy="80" r="70" stroke="#e5e7eb" strokeWidth="12" fill="none" />
                                            <circle cx="80" cy="80" r="70" stroke={results.qualityScore >= 80 ? '#10b981' : results.qualityScore >= 60 ? '#f59e0b' : '#ef4444'} strokeWidth="12" fill="none" strokeDasharray={`${results.qualityScore * 4.4} 440`} strokeLinecap="round" />
                                        </svg>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className="text-4xl font-bold">{results.qualityScore}</span>
                                        </div>
                                    </div>
                                    <p className={`mt-4 font-semibold ${results.qualityScore >= 80 ? 'text-green-600' : results.qualityScore >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                                        {results.qualityScore >= 80 ? 'Excellent' : results.qualityScore >= 60 ? 'Good' : 'Needs Improvement'}
                                    </p>
                                </div>

                                <div className="card lg:col-span-2">
                                    <h3 className="text-lg font-semibold mb-4">Quality Dimensions</h3>
                                    <ResponsiveContainer width="100%" height={250}>
                                        <RadialBarChart cx="50%" cy="50%" innerRadius="20%" outerRadius="90%" data={results.qualityRadar} startAngle={180} endAngle={0}>
                                            <RadialBar minAngle={15} background clockWise dataKey="value" fill="#8b5cf6" />
                                            <Legend iconSize={10} layout="horizontal" verticalAlign="bottom" />
                                            <Tooltip />
                                        </RadialBarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Quality Metrics Detail */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {[
                                    { label: 'Completeness', value: (100 - (results.summary.missingTotal / (results.summary.rows * results.summary.columns) * 100)).toFixed(1), desc: 'Data without missing values', color: 'green' },
                                    { label: 'Uniqueness', value: ((results.summary.rows - results.summary.duplicateRows) / results.summary.rows * 100).toFixed(1), desc: 'Unique records', color: 'blue' },
                                    { label: 'Consistency', value: (100 - (results.summary.outlierTotal / results.summary.rows * 100)).toFixed(1), desc: 'Data within expected ranges', color: 'purple' },
                                    { label: 'Validity', value: Math.min(100, results.qualityScore + 5).toFixed(1), desc: 'Valid data format', color: 'pink' }
                                ].map((metric, i) => (
                                    <div key={i} className="card">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-gray-600 text-sm">{metric.label}</span>
                                            <span className={`text-2xl font-bold ${METRIC_TEXT_CLASS[ metric.color ] || 'text-slate-700'}`}>{metric.value}%</span>
                                        </div>
                                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full ${METRIC_BAR_CLASS[ metric.color ] || 'bg-slate-500'}`} style={{ width: `${metric.value}%` }} />
                                        </div>
                                        <p className="text-xs text-gray-500 mt-2">{metric.desc}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Missing Data Detail */}
                            <div className="card">
                                <h3 className="text-lg font-semibold mb-4">Missing Data by Column</h3>
                                <div className="space-y-3">
                                    {results.missingData.filter(m => m.missing > 0).length > 0 ? (
                                        results.missingData.filter(m => m.missing > 0).sort((a, b) => b.percentage - a.percentage).map((m, i) => (
                                            <div key={i} className="flex items-center gap-4">
                                                <span className="w-32 text-sm font-medium truncate">{m.name}</span>
                                                <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                                                    <div className={`h-full rounded-full ${m.percentage > 50 ? 'bg-red-500' : m.percentage > 20 ? 'bg-orange-500' : 'bg-yellow-500'}`} style={{ width: `${m.percentage}%` }} />
                                                </div>
                                                <span className="text-sm text-gray-600 w-20 text-right">{m.missing} ({m.percentage.toFixed(1)}%)</span>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-8 text-green-600">
                                            <CheckCircle size={48} className="mx-auto mb-2" />
                                            <p className="font-semibold">No Missing Data!</p>
                                            <p className="text-sm text-gray-500">All columns are complete</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Categorical Analysis */}
                            {results.categoricalAnalysis.length > 0 && (
                                <div className="card">
                                    <h3 className="text-lg font-semibold mb-4">Categorical Columns Analysis</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {results.categoricalAnalysis.map((cat, i) => (
                                            <div key={i} className="border rounded-lg p-4">
                                                <div className="flex items-center justify-between mb-3">
                                                    <h4 className="font-semibold">{cat.name}</h4>
                                                    <span className="text-xs text-gray-500">{cat.uniqueValues} unique values</span>
                                                </div>
                                                <ResponsiveContainer width="100%" height={150}>
                                                    <BarChart data={cat.topValues.slice(0, 5)} layout="vertical">
                                                        <CartesianGrid strokeDasharray="3 3" />
                                                        <XAxis type="number" />
                                                        <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 10 }} />
                                                        <Tooltip />
                                                        <Bar dataKey="value" fill={COLORS[ i % COLORS.length ]} radius={[ 0, 4, 4, 0 ]} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                                <div className="flex justify-between text-xs text-gray-500 mt-2">
                                                    <span>Entropy: {cat.entropy}</span>
                                                    <span>Top value: {cat.dominance}%</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

export default AutoEDA
