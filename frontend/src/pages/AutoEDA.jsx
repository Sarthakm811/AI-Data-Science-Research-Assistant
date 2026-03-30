import React, { useState, useMemo, useEffect, useRef } from 'react'
import { BarChart3, PieChart, TrendingUp, AlertCircle, CheckCircle, Zap, Target, Eye, Lightbulb, ArrowUp, ArrowDown, Minus, Filter, Download, RefreshCw } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, LineChart, Line, ScatterChart, Scatter, AreaChart, Area, RadialBarChart, RadialBar, Legend, ComposedChart } from 'recharts'
import { useAnalysis } from '../context/AnalysisContext'
import { chatAPI, queryAPI, sessionAPI, edaAPI, handleApiError, ensureBackendDataset } from '../services/api'

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

function clampPercent(value) {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(100, value))
}

function heatColor(value, type = 'correlation') {
    const v = Number(value)
    if (!Number.isFinite(v)) return '#e5e7eb'

    if (type === 'missing') {
        const intensity = Math.round(255 - clampPercent(v) * 1.8)
        return `rgb(255, ${intensity}, 140)`
    }

    const abs = Math.abs(v)
    if (v >= 0) {
        const green = Math.round(220 - abs * 120)
        return `rgb(16, ${green}, 129)`
    }
    const red = Math.round(220 - abs * 120)
    return `rgb(${red}, 68, 68)`
}

function createBusinessAnswer(question, results) {
    const q = String(question || '').trim().toLowerCase()
    if (!q || !results) return ''

    const topMissing = [ ...results.missingData ]
        .sort((a, b) => b.percentage - a.percentage)
        .slice(0, 3)
    const topCorr = [ ...results.correlations ]
        .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))[ 0 ]
    const topOutlier = [ ...results.statistics ]
        .sort((a, b) => b.outlierCount - a.outlierCount)[ 0 ]
    const topSkew = [ ...results.statistics ]
        .sort((a, b) => Math.abs(parseFloat(b.skewness)) - Math.abs(parseFloat(a.skewness)))[ 0 ]

    if (q.includes('missing')) {
        if (!topMissing.length || topMissing[ 0 ].missing === 0) {
            return 'No major missing-value risk found. Missing data is negligible across columns.'
        }
        return `Most missing data appears in ${topMissing.map((m) => `${m.name} (${(m.percentage || 0).toFixed(1)}%)`).join(', ')}.`
    }

    if (q.includes('correlation') || q.includes('related') || q.includes('impact')) {
        if (!topCorr) return 'Not enough numeric columns to evaluate variable relationships.'
        return `Strongest relationship: ${topCorr.feature1} vs ${topCorr.feature2} with ${(topCorr.correlation || 0).toFixed(3)} correlation (${(topCorr.direction || '').toLowerCase()}).`
    }

    if (q.includes('outlier') || q.includes('anomal')) {
        if (!topOutlier || topOutlier.outlierCount === 0) {
            return 'No significant outlier concentration detected in numeric features.'
        }
        return `Highest outlier concentration is in ${topOutlier.name} (${topOutlier.outlierCount} values, ${topOutlier.outlierPercentage}%).`
    }

    if (q.includes('quality')) {
        return `Current quality score is ${results.qualityScore}/100 with ${results.summary.missingTotal} missing cells and ${results.summary.outlierTotal} detected outliers.`
    }

    if (q.includes('distribution') || q.includes('skew')) {
        if (!topSkew) return 'No distribution evidence available.'
        return `${topSkew.name} is most skewed (skewness ${topSkew.skewness}), suggesting possible transformation before modeling.`
    }

    return `Summary: quality ${results.qualityScore}/100, strongest correlation ${topCorr ? `${topCorr.feature1}↔${topCorr.feature2} (${topCorr.correlation.toFixed(3)})` : 'N/A'}, top outlier column ${topOutlier ? topOutlier.name : 'N/A'}.`
}

function evaluateHypothesis(statement, feature1, feature2, results) {
    const text = String(statement || '').trim()
    if (!text) return { status: 'invalid', message: 'Hypothesis statement is required.' }
    if (!results) return { status: 'invalid', message: 'Run analysis first.' }

    if (feature1 && feature2) {
        const pair = results.correlations.find((c) => (
            (c.feature1 === feature1 && c.feature2 === feature2) ||
            (c.feature1 === feature2 && c.feature2 === feature1)
        ))
        if (!pair) {
            return {
                status: 'insufficient',
                message: `No correlation evidence available between ${feature1} and ${feature2}.`
            }
        }

        const abs = Math.abs(pair.correlation)
        if (abs >= 0.5) {
            return {
                status: 'supported',
                message: `Hypothesis has support: ${feature1} and ${feature2} show ${(pair.correlation || 0).toFixed(3)} correlation (${(pair.strength || 'unknown').toLowerCase()}).`
            }
        }
        return {
            status: 'weak',
            message: `Evidence is weak: correlation between ${feature1} and ${feature2} is ${(pair.correlation || 0).toFixed(3)}.`
        }
    }

    const quality = results.qualityScore
    return quality >= 75
        ? { status: 'supported', message: `Dataset quality (${quality}/100) is strong enough to explore this hypothesis further.` }
        : { status: 'weak', message: `Dataset quality (${quality}/100) suggests cleaning/improvement before testing this hypothesis.` }
}

function scoreBusinessAnswerConfidence(question, results) {
    if (!results) return { label: 'Low', score: 35, tone: 'red' }

    const q = String(question || '').trim().toLowerCase()
    const hasCorrelations = Array.isArray(results.correlations) && results.correlations.length > 0
    const hasMissing = Array.isArray(results.missingData) && results.missingData.length > 0
    const hasStats = Array.isArray(results.statistics) && results.statistics.length > 0

    if (q.includes('correlation') || q.includes('related') || q.includes('impact')) {
        const strong = results.correlations.filter((c) => Math.abs(c.correlation) >= 0.5).length
        if (strong > 0) return { label: 'High', score: 88, tone: 'green' }
        if (hasCorrelations) return { label: 'Medium', score: 68, tone: 'yellow' }
        return { label: 'Low', score: 40, tone: 'red' }
    }

    if (q.includes('missing') || q.includes('quality') || q.includes('outlier') || q.includes('distribution') || q.includes('skew')) {
        if (hasMissing && hasStats) return { label: 'High', score: 84, tone: 'green' }
        if (hasMissing || hasStats) return { label: 'Medium', score: 64, tone: 'yellow' }
        return { label: 'Low', score: 42, tone: 'red' }
    }

    if (hasCorrelations && hasMissing && hasStats) return { label: 'Medium', score: 72, tone: 'yellow' }
    return { label: 'Low', score: 48, tone: 'red' }
}

function AutoEDA({ dataset }) {
    const [ analyzing, setAnalyzing ] = useState(false)
    const [ results, setResults ] = useState(null)
    const [ activeTab, setActiveTab ] = useState('dashboard')
    const [ selectedColumn, setSelectedColumn ] = useState(null)
    const [ filterOutliers, setFilterOutliers ] = useState(false)
    const [ businessQuestion, setBusinessQuestion ] = useState('')
    const [ businessAnswer, setBusinessAnswer ] = useState('')
    const [ businessConfidence, setBusinessConfidence ] = useState(null)
    const [ qaLoading, setQaLoading ] = useState(false)
    const [ qaError, setQaError ] = useState('')
    const [ qaSessionId, setQaSessionId ] = useState(null)
    const [ hypothesisText, setHypothesisText ] = useState('')
    const [ hypothesisFeature1, setHypothesisFeature1 ] = useState('')
    const [ hypothesisFeature2, setHypothesisFeature2 ] = useState('')
    const [ hypothesisResult, setHypothesisResult ] = useState(null)
    const [ vizChartType, setVizChartType ] = useState('bar')
    const [ vizXColumn, setVizXColumn ] = useState('')
    const [ vizYColumn, setVizYColumn ] = useState('')
    const [ vizAggregation, setVizAggregation ] = useState('mean')
    const vizChartRef = useRef(null)
    const { setEdaResults } = useAnalysis()

    useEffect(() => {
        let isMounted = true

        const initQaSession = async () => {
            try {
                const session = await sessionAPI.createSession()
                if (isMounted && session?.session_id) {
                    setQaSessionId(session.session_id)
                }
            } catch (_err) {
                // Optional session setup; fallback session id is used if this fails.
            }
        }

        initQaSession()
        return () => {
            isMounted = false
        }
    }, [])

    const runAnalysis = async () => {
        if (!dataset) return
        setAnalyzing(true)
        try {
            const backendId = await ensureBackendDataset(dataset)
            const sessionId = qaSessionId || `eda-${Date.now()}`
            const analysisResponse = await edaAPI.analyzeDataset(backendId, sessionId)
            const edaResults = analysisResponse.eda || analysisResponse
            setResults(edaResults)
            setEdaResults(edaResults)
            setBusinessAnswer('')
            setBusinessConfidence(null)
            setHypothesisResult(null)
        } catch (error) {
            console.error('Backend EDA error:', error)
            setResults({
                summary: { rows: dataset.rowCount, columns: dataset.colCount, numericCols: 0, categoricalCols: 0, missingTotal: 0, duplicateRows: 0, outlierTotal: 0 },
                missingData: [], statistics: [], correlations: [], categoricalAnalysis: [], qualityScore: 0,
                insights: [ {
                    type: 'warning', title: 'Analysis Error',
                    desc: error?.message || 'An error occurred during backend EDA.',
                    action: 'Check your data and try again'
                } ],
                qualityRadar: [
                    { subject: 'Completeness', A: 0 }, { subject: 'Consistency', A: 0 },
                    { subject: 'Validity', A: 0 }, { subject: 'Uniqueness', A: 0 }
                ],
                typeCount: [], numericColumns: [], dateColumns: [],
                correlationHeatmap: { labels: [], values: [] },
                missingHeatmap: { labels: [], rowLabels: [], values: [] },
                trendInsights: [], segmentationInsights: [], comparativeInsights: [], behavioralInsights: []
            })
        }
        setAnalyzing(false)
    }

    const handleBusinessQuestion = async () => {
        const question = String(businessQuestion || '').trim()
        if (!question) return

        setQaError('')
        setQaLoading(true)

        const localAnswer = createBusinessAnswer(question, results)
        const confidence = scoreBusinessAnswerConfidence(question, results)

        // Resolve backend dataset id — dataset.id is set after ensureBackendDataset runs
        let datasetId = dataset?.id || null
        if (!datasetId && dataset) {
            try { datasetId = await ensureBackendDataset(dataset) } catch (_) { /* best-effort */ }
        }

        try {
            let backendAnswer = ''

            try {
                const enhanced = await queryAPI.enhancedQuery(
                    qaSessionId || 'eda-business',
                    question,
                    datasetId,
                    true,
                    false
                )
                backendAnswer = enhanced?.explanation || enhanced?.response || enhanced?.message || ''
            } catch (_enhancedErr) {
                const chatFallback = await chatAPI.sendMessage(
                    `Provide a concise business-focused interpretation for this question: ${question}`,
                    datasetId,
                    qaSessionId || 'eda-business'
                )
                backendAnswer = chatFallback?.response || chatFallback?.message || ''
            }

            if (backendAnswer && localAnswer) {
                setBusinessAnswer(`${backendAnswer}\n\nEvidence from current EDA:\n${localAnswer}`)
            } else {
                setBusinessAnswer(backendAnswer || localAnswer || 'No answer could be generated for this question.')
            }
            setBusinessConfidence(confidence)
        } catch (err) {
            setQaError(handleApiError(err))
            setBusinessAnswer(localAnswer || 'Unable to generate an answer right now. Please retry after running analysis.')
            setBusinessConfidence(confidence)
        } finally {
            setQaLoading(false)
        }
    }

    const handleHypothesisCheck = () => {
        setHypothesisResult(evaluateHypothesis(hypothesisText, hypothesisFeature1, hypothesisFeature2, results))
    }

    const handleExportVisualization = () => {
        const chartContainer = vizChartRef.current
        if (!chartContainer) return

        const svg = chartContainer.querySelector('svg')
        if (!svg) return

        const serializer = new XMLSerializer()
        const source = serializer.serializeToString(svg)
        const svgBlob = new Blob([ source ], { type: 'image/svg+xml;charset=utf-8' })
        const url = URL.createObjectURL(svgBlob)

        const image = new Image()
        image.onload = () => {
            const canvas = document.createElement('canvas')
            const scale = 2
            canvas.width = (svg.clientWidth || 1000) * scale
            canvas.height = (svg.clientHeight || 380) * scale

            const ctx = canvas.getContext('2d')
            if (!ctx) {
                URL.revokeObjectURL(url)
                return
            }

            ctx.setTransform(scale, 0, 0, scale, 0, 0)
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(image, 0, 0)

            const link = document.createElement('a')
            const safeX = (vizXColumn || 'x').replace(/\s+/g, '_')
            const safeY = (vizYColumn || 'y').replace(/\s+/g, '_')
            link.download = `visualization_${vizChartType}_${safeX}_${safeY}.png`
            link.href = canvas.toDataURL('image/png')
            link.click()
            URL.revokeObjectURL(url)
        }

        image.src = url
    }

    // Memoized filtered data
    const filteredStats = useMemo(() => {
        if (!results) return []
        return filterOutliers ? results.statistics.map(s => ({ ...s, outlierCount: 0 })) : results.statistics
    }, [ results, filterOutliers ])

    const vizNumericColumns = useMemo(() => results?.numericColumns || [], [ results ])
    const vizCategoricalColumns = useMemo(() => results?.categoricalAnalysis?.map((c) => c.name) || [], [ results ])
    const vizAvailableColumns = useMemo(() => dataset?.headers || [], [ dataset ])

    useEffect(() => {
        if (!results || !dataset) return

        if (!vizXColumn) {
            const defaultX = vizCategoricalColumns[ 0 ] || vizAvailableColumns[ 0 ] || ''
            setVizXColumn(defaultX)
        }

        if (!vizYColumn) {
            const defaultY = vizNumericColumns[ 0 ] || ''
            setVizYColumn(defaultY)
        }
    }, [ results, dataset, vizXColumn, vizYColumn, vizCategoricalColumns, vizAvailableColumns, vizNumericColumns ])

    const vizData = useMemo(() => {
        if (!dataset?.rows?.length || !vizXColumn) return []

        if (vizChartType === 'scatter') {
            if (!vizYColumn) return []

            return dataset.rows
                .map((row) => ({
                    x: parseFloat(row[ vizXColumn ]),
                    y: parseFloat(row[ vizYColumn ])
                }))
                .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
                .slice(0, 250)
        }

        if (vizChartType === 'pie') {
            const grouped = {}
            dataset.rows.forEach((row) => {
                const key = String(row[ vizXColumn ] ?? 'Missing').trim() || 'Missing'
                grouped[ key ] = (grouped[ key ] || 0) + 1
            })

            return Object.entries(grouped)
                .map(([ name, value ]) => ({ name, value }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 12)
        }

        const grouped = {}
        dataset.rows.forEach((row) => {
            const key = String(row[ vizXColumn ] ?? 'Missing').trim() || 'Missing'
            if (!grouped[ key ]) grouped[ key ] = []

            const raw = parseFloat(row[ vizYColumn ])
            if (Number.isFinite(raw)) grouped[ key ].push(raw)
        })

        return Object.entries(grouped)
            .map(([ name, values ]) => {
                if (!values.length) return { name, value: 0 }

                if (vizAggregation === 'sum') {
                    return { name, value: values.reduce((acc, val) => acc + val, 0) }
                }

                if (vizAggregation === 'count') {
                    return { name, value: values.length }
                }

                const avg = values.reduce((acc, val) => acc + val, 0) / values.length
                return { name, value: avg }
            })
            .sort((a, b) => b.value - a.value)
            .slice(0, 20)
    }, [ dataset, vizXColumn, vizYColumn, vizChartType, vizAggregation ])

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
        { id: 'quality', label: 'Data Quality', icon: CheckCircle },
        { id: 'visualization', label: 'Visualization', icon: PieChart },
        { id: 'business', label: 'Business Q&A', icon: Target }
    ]

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="card hero-contrast bg-gradient-to-r from-blue-800 via-teal-700 to-orange-600 text-white">
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
                        <button onClick={runAnalysis} disabled={analyzing} className="btn-secondary flex items-center gap-2 border-white/40 bg-white text-blue-700 hover:bg-white/90">
                            {analyzing ? <RefreshCw size={18} className="animate-spin" /> : <Zap size={18} />}
                            {analyzing ? 'Analyzing...' : 'Run Analysis'}
                        </button>
                    </div>
                </div>
                <div className="mt-4 flex gap-6 text-sm">
                    <span className="chip-soft">{dataset.name}</span>
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
                                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-5 py-3 rounded-xl whitespace-nowrap transition-all ${activeTab === tab.id ? 'bg-slate-900 text-white shadow-md' : 'surface-panel text-slate-700 hover:bg-white hover:text-slate-900'}`}>
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
                                        <h3 className="section-title">Column Explorer</h3>
                                        <select value={selectedColumn || ''} onChange={(e) => setSelectedColumn(e.target.value)} className="input-field min-h-0 px-3 py-2 text-sm">
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
                                    <h3 className="section-title mb-4">Top Correlations</h3>
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
                                    <h3 className="section-title mb-4">Missing Data Heatmap</h3>
                                    <ResponsiveContainer width="100%" height={200}>
                                        <BarChart data={results.missingData} layout="vertical">
                                            <CartesianGrid strokeDasharray="3 3" /><XAxis type="number" domain={[ 0, 100 ]} /><YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} /><Tooltip formatter={(v) => `${v.toFixed(1)}%`} /><Bar dataKey="percentage" fill="#f59e0b" radius={[ 0, 4, 4, 0 ]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="card">
                                    <h3 className="section-title mb-4">Data Types</h3>
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
                                    <h3 className="section-title">Numeric Statistics</h3>
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
                                {results.insights.map((insight, i) => {
                                    const borderColor = insight.type === 'warning' ? 'border-orange-500 bg-orange-50'
                                        : insight.type === 'success' ? 'border-green-500 bg-green-50'
                                            : 'border-blue-500 bg-blue-50'
                                    const iconColor = insight.type === 'warning' ? 'text-orange-500'
                                        : insight.type === 'success' ? 'text-green-500'
                                            : 'text-blue-500'
                                    const IconComp = insight.type === 'warning' ? AlertCircle
                                        : insight.type === 'success' ? CheckCircle
                                            : Lightbulb
                                    return (
                                        <div key={i} className={`card border-l-4 ${borderColor}`}>
                                            <div className="flex items-start gap-3">
                                                <IconComp size={22} className={`${iconColor} shrink-0 mt-0.5`} />
                                                <div>
                                                    <h4 className="font-semibold text-gray-800">{insight.title}</h4>
                                                    <p className="text-sm text-gray-600 mt-1">{insight.desc}</p>
                                                    {insight.action && (
                                                        <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                                                            <Target size={12} /> {insight.action}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Recommendations */}
                            <div className="card">
                                <h3 className="section-title mb-4 flex items-center gap-2"><Lightbulb className="text-yellow-500" /> Smart Recommendations</h3>
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

                            {(results.trendInsights?.length > 0 || results.segmentationInsights?.length > 0 || results.comparativeInsights?.length > 0 || results.behavioralInsights?.length > 0) && (
                                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                                    {results.trendInsights?.length > 0 && (
                                        <div className="card">
                                            <h3 className="section-title mb-3">📈 Trend Insights</h3>
                                            <div className="space-y-3">
                                                {results.trendInsights.map((item, idx) => (
                                                    <div key={`trend-${idx}`} className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                                                        <div className="flex items-center justify-between gap-2 mb-1">
                                                            <p className="font-semibold text-slate-800 text-sm">{item.title}</p>
                                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.confidence === 'High' || item.confidence === 'Very High' ? 'bg-green-100 text-green-700' : item.confidence === 'Medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-500'}`}>{item.confidence}</span>
                                                        </div>
                                                        <p className="text-sm text-slate-600">{item.detail}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {results.segmentationInsights?.length > 0 && (
                                        <div className="card">
                                            <h3 className="section-title mb-3">🎯 Segmentation Insights</h3>
                                            <div className="space-y-3">
                                                {results.segmentationInsights.map((item, idx) => (
                                                    <div key={`seg-${idx}`} className="rounded-lg border border-purple-100 bg-purple-50 p-3">
                                                        <div className="flex items-center justify-between gap-2 mb-1">
                                                            <p className="font-semibold text-slate-800 text-sm">{item.title}</p>
                                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.confidence === 'High' || item.confidence === 'Very High' ? 'bg-green-100 text-green-700' : item.confidence === 'Medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-500'}`}>{item.confidence}</span>
                                                        </div>
                                                        <p className="text-sm text-slate-600">{item.detail}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {results.comparativeInsights?.length > 0 && (
                                        <div className="card">
                                            <h3 className="section-title mb-3">⚖️ Comparative Insights</h3>
                                            <div className="space-y-3">
                                                {results.comparativeInsights.map((item, idx) => (
                                                    <div key={`cmp-${idx}`} className="rounded-lg border border-teal-100 bg-teal-50 p-3">
                                                        <div className="flex items-center justify-between gap-2 mb-1">
                                                            <p className="font-semibold text-slate-800 text-sm">{item.title}</p>
                                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.confidence === 'High' || item.confidence === 'Very High' ? 'bg-green-100 text-green-700' : item.confidence === 'Medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-500'}`}>{item.confidence}</span>
                                                        </div>
                                                        <p className="text-sm text-slate-600">{item.detail}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {results.behavioralInsights?.length > 0 && (
                                        <div className="card">
                                            <h3 className="section-title mb-3">🧠 Behavioral Insights</h3>
                                            <div className="space-y-3">
                                                {results.behavioralInsights.map((item, idx) => (
                                                    <div key={`bhv-${idx}`} className="rounded-lg border border-orange-100 bg-orange-50 p-3">
                                                        <div className="flex items-center justify-between gap-2 mb-1">
                                                            <p className="font-semibold text-slate-800 text-sm">{item.title}</p>
                                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.confidence === 'High' || item.confidence === 'Very High' ? 'bg-green-100 text-green-700' : item.confidence === 'Medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-500'}`}>{item.confidence}</span>
                                                        </div>
                                                        <p className="text-sm text-slate-600">{item.detail}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Distributions Tab */}
                    {activeTab === 'distributions' && (
                        <div className="space-y-6">
                            {results.statistics.length > 0 ? (
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

                                            <div className="mt-4">
                                                <p className="mb-2 text-xs font-semibold text-slate-600">Boxplot View</p>
                                                <div className="relative h-8 rounded bg-slate-100">
                                                    <div className="absolute top-1/2 h-0.5 bg-slate-400" style={{ left: '0%', width: '100%', transform: 'translateY(-50%)' }} />
                                                    <div
                                                        className="absolute top-1/2 h-4 -translate-y-1/2 rounded bg-blue-300/80"
                                                        style={{
                                                            left: `${clampPercent(((stat.q1 - stat.min) / ((stat.max - stat.min) || 1)) * 100)}%`,
                                                            width: `${clampPercent(((stat.q3 - stat.q1) / ((stat.max - stat.min) || 1)) * 100)}%`
                                                        }}
                                                    />
                                                    <div
                                                        className="absolute top-1/2 h-5 w-0.5 -translate-y-1/2 bg-blue-900"
                                                        style={{ left: `${clampPercent(((stat.median - stat.min) / ((stat.max - stat.min) || 1)) * 100)}%` }}
                                                    />
                                                    <div
                                                        className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-slate-700"
                                                        style={{ left: `${clampPercent(((stat.min - stat.min) / ((stat.max - stat.min) || 1)) * 100)}%` }}
                                                    />
                                                    <div
                                                        className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-slate-700"
                                                        style={{ left: `${clampPercent(((stat.max - stat.min) / ((stat.max - stat.min) || 1)) * 100)}%` }}
                                                    />
                                                </div>
                                                <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                                                    <span>Min</span><span>Q1</span><span>Median</span><span>Q3</span><span>Max</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : results.categoricalAnalysis.length > 0 ? (
                                <div className="space-y-4">
                                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                                        No numeric columns were detected. Showing categorical value distributions instead.
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {results.categoricalAnalysis.map((cat, i) => (
                                            <div key={i} className="card">
                                                <div className="mb-3 flex items-center justify-between">
                                                    <h4 className="font-semibold">{cat.name}</h4>
                                                    <span className="text-xs text-slate-500">{cat.uniqueValues} unique</span>
                                                </div>
                                                <ResponsiveContainer width="100%" height={220}>
                                                    <BarChart data={cat.topValues.slice(0, 8)} layout="vertical">
                                                        <CartesianGrid strokeDasharray="3 3" />
                                                        <XAxis type="number" />
                                                        <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 10 }} />
                                                        <Tooltip formatter={(value, name) => name === 'value' ? `${value} rows` : value} />
                                                        <Bar dataKey="value" fill={COLORS[ i % COLORS.length ]} radius={[ 0, 4, 4, 0 ]} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                                <div className="mt-2 flex justify-between text-xs text-gray-500">
                                                    <span>Entropy: {cat.entropy}</span>
                                                    <span>Top value: {cat.dominance}%</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="card text-center py-12 text-slate-500">
                                    No distribution data is available for this dataset.
                                </div>
                            )}
                        </div>
                    )}

                    {/* Correlations Tab */}
                    {activeTab === 'correlations' && (
                        <div className="space-y-6">
                            <div className="card">
                                <h3 className="section-title mb-4">Correlation Heatmap</h3>
                                {(results.correlationHeatmap?.labels?.length || 0) > 1 ? (
                                    <div className="overflow-auto">
                                        <div className="inline-grid gap-1" style={{ gridTemplateColumns: `120px repeat(${results.correlationHeatmap.labels.length}, minmax(56px, 56px))` }}>
                                            <div className="bg-white" />
                                            {results.correlationHeatmap.labels.map((label) => (
                                                <div key={`hx-${label}`} className="text-[10px] font-semibold text-slate-600 text-center truncate" title={label}>{label}</div>
                                            ))}
                                            {results.correlationHeatmap.labels.map((rowLabel, rIdx) => (
                                                <React.Fragment key={`row-${rowLabel}`}>
                                                    <div className="text-[10px] font-semibold text-slate-600 truncate pr-2" title={rowLabel}>{rowLabel}</div>
                                                    {(results.correlationHeatmap.values?.[ rIdx ] || []).map((value, cIdx) => (
                                                        <div
                                                            key={`cell-${rIdx}-${cIdx}`}
                                                            className="h-7 w-14 rounded text-center text-[10px] leading-7 font-semibold text-white"
                                                            style={{ backgroundColor: heatColor(value, 'correlation') }}
                                                            title={`${rowLabel} vs ${results.correlationHeatmap.labels[ cIdx ]}: ${value.toFixed(3)}`}
                                                        >
                                                            {value.toFixed(2)}
                                                        </div>
                                                    ))}
                                                </React.Fragment>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-slate-500">Need at least 2 numeric columns for a correlation heatmap.</p>
                                )}
                            </div>

                            {/* Correlation Matrix */}
                            <div className="card">
                                <h3 className="text-lg font-semibold mb-4">Correlation Analysis</h3>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {results.correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)).slice(0, 6).map((c, i) => (
                                        <div key={i} className="card">
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
                                            <RadialBar minAngle={15} background clockWise dataKey="A" fill="#8b5cf6" />
                                            <Legend iconSize={10} layout="horizontal" verticalAlign="bottom" />
                                            <Tooltip />
                                        </RadialBarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Quality Metrics Detail */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {[
                                    { label: 'Completeness', value: (100 - ((results.summary.missingTotal || 0) / ((results.summary.rows || 1) * (results.summary.columns || 1)) * 100)).toFixed(1), desc: 'Data without missing values', color: 'green' },
                                    { label: 'Uniqueness', value: (((results.summary.rows || 1) - (results.summary.duplicateRows || 0)) / (results.summary.rows || 1) * 100).toFixed(1), desc: 'Unique records', color: 'blue' },
                                    { label: 'Consistency', value: (100 - ((results.summary.outlierTotal || 0) / (results.summary.rows || 1) * 100)).toFixed(1), desc: 'Data within expected ranges', color: 'purple' },
                                    { label: 'Validity', value: Math.min(100, (results.qualityScore || 0) + 5).toFixed(1), desc: 'Valid data format', color: 'pink' }
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

                            <div className="card">
                                <h3 className="text-lg font-semibold mb-4">True Missingness Heatmap (Row x Column)</h3>
                                <p className="mb-3 text-xs text-slate-500">First {results.missingHeatmap.rowLabels.length} rows shown. Darker cells indicate missing values.</p>
                                <div className="overflow-auto">
                                    <div className="inline-grid gap-1" style={{ gridTemplateColumns: `70px repeat(${results.missingHeatmap.labels.length}, minmax(56px, 56px))` }}>
                                        <div className="bg-white" />
                                        {results.missingHeatmap.labels.map((label) => (
                                            <div key={`mx-${label}`} className="text-[10px] font-semibold text-slate-600 text-center truncate" title={label}>{label}</div>
                                        ))}
                                        {results.missingHeatmap.rowLabels.map((rowId, rIdx) => (
                                            <React.Fragment key={`mrow-${rowId}`}>
                                                <div className="text-[10px] text-slate-500">Row {rowId}</div>
                                                {results.missingHeatmap.values[ rIdx ].map((value, cIdx) => (
                                                    <div
                                                        key={`mcell-${rIdx}-${cIdx}`}
                                                        className="h-5 w-14 rounded"
                                                        style={{ backgroundColor: heatColor(value, 'missing') }}
                                                        title={`${results.missingHeatmap.labels[ cIdx ]}: ${value > 0 ? 'Missing' : 'Present'}`}
                                                    />
                                                ))}
                                            </React.Fragment>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Categorical Analysis */}
                            {results.categoricalAnalysis.length > 0 && (
                                <div className="card">
                                    <h3 className="text-lg font-semibold mb-4">Categorical Columns Analysis</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {results.categoricalAnalysis.map((cat, i) => (
                                            <div key={i} className="card">
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

                    {/* Visualization Tab */}
                    {activeTab === 'visualization' && (
                        <div className="space-y-6">
                            <div className="card">
                                <h3 className="section-title mb-4">Custom Visualization Builder</h3>
                                <p className="mb-4 text-sm text-slate-600">Choose columns and chart type to quickly understand patterns, composition, and relationships in your dataset.</p>

                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold text-slate-600">Chart Type</label>
                                        <select value={vizChartType} onChange={(e) => setVizChartType(e.target.value)} className="input-field">
                                            <option value="bar">Bar Chart</option>
                                            <option value="line">Line Chart</option>
                                            <option value="area">Area Chart</option>
                                            <option value="pie">Pie Chart</option>
                                            <option value="scatter">Scatter Plot</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="mb-1 block text-xs font-semibold text-slate-600">X Axis / Category</label>
                                        <select value={vizXColumn} onChange={(e) => setVizXColumn(e.target.value)} className="input-field">
                                            {vizAvailableColumns.map((col) => <option key={`viz-x-${col}`} value={col}>{col}</option>)}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="mb-1 block text-xs font-semibold text-slate-600">Y Axis (numeric)</label>
                                        <select value={vizYColumn} onChange={(e) => setVizYColumn(e.target.value)} className="input-field" disabled={vizChartType === 'pie'}>
                                            {vizNumericColumns.length ? vizNumericColumns.map((col) => <option key={`viz-y-${col}`} value={col}>{col}</option>) : <option value="">No numeric columns</option>}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="mb-1 block text-xs font-semibold text-slate-600">Aggregation</label>
                                        <select value={vizAggregation} onChange={(e) => setVizAggregation(e.target.value)} className="input-field" disabled={vizChartType === 'scatter' || vizChartType === 'pie'}>
                                            <option value="mean">Average</option>
                                            <option value="sum">Sum</option>
                                            <option value="count">Count</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="card">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <h3 className="section-title">Visualization Preview</h3>
                                    <button
                                        onClick={handleExportVisualization}
                                        disabled={!vizData.length}
                                        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <Download size={14} /> Export PNG
                                    </button>
                                </div>
                                {!vizData.length ? (
                                    <p className="py-10 text-center text-sm text-slate-500">Unable to render chart with current selections. Try another column combination.</p>
                                ) : (
                                    <div ref={vizChartRef}>
                                        {vizChartType === 'bar' && (
                                            <ResponsiveContainer width="100%" height={380}>
                                                <BarChart data={vizData}>
                                                    <CartesianGrid strokeDasharray="3 3" />
                                                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                                    <YAxis />
                                                    <Tooltip />
                                                    <Bar dataKey="value" fill="#6366f1" radius={[ 6, 6, 0, 0 ]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        )}

                                        {vizChartType === 'line' && (
                                            <ResponsiveContainer width="100%" height={380}>
                                                <LineChart data={vizData}>
                                                    <CartesianGrid strokeDasharray="3 3" />
                                                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                                    <YAxis />
                                                    <Tooltip />
                                                    <Line type="monotone" dataKey="value" stroke="#06b6d4" strokeWidth={3} dot={false} />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        )}

                                        {vizChartType === 'area' && (
                                            <ResponsiveContainer width="100%" height={380}>
                                                <AreaChart data={vizData}>
                                                    <defs>
                                                        <linearGradient id="vizArea" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.7} />
                                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" />
                                                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                                    <YAxis />
                                                    <Tooltip />
                                                    <Area type="monotone" dataKey="value" stroke="#10b981" fill="url(#vizArea)" />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        )}

                                        {vizChartType === 'pie' && (
                                            <ResponsiveContainer width="100%" height={380}>
                                                <RechartsPie>
                                                    <Tooltip />
                                                    <Legend />
                                                    <Pie data={vizData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={150} label>
                                                        {vizData.map((_, idx) => <Cell key={`viz-pie-${idx}`} fill={COLORS[ idx % COLORS.length ]} />)}
                                                    </Pie>
                                                </RechartsPie>
                                            </ResponsiveContainer>
                                        )}

                                        {vizChartType === 'scatter' && (
                                            <ResponsiveContainer width="100%" height={380}>
                                                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                                    <CartesianGrid strokeDasharray="3 3" />
                                                    <XAxis dataKey="x" name={vizXColumn} type="number" />
                                                    <YAxis dataKey="y" name={vizYColumn} type="number" />
                                                    <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                                                    <Scatter data={vizData} fill="#f97316" />
                                                </ScatterChart>
                                            </ResponsiveContainer>
                                        )}
                                    </div>
                                )}

                                <div className="mt-4 text-xs text-slate-500">
                                    <span className="font-semibold">Current setup:</span> {vizChartType.toUpperCase()} using <span className="font-semibold">{vizXColumn || 'N/A'}</span>{vizChartType !== 'pie' ? ` vs ${vizYColumn || 'N/A'} (${vizAggregation})` : ''}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'business' && (
                        <div className="space-y-6">
                            <div className="card">
                                <h3 className="text-lg font-semibold mb-4">Ask Business Questions</h3>
                                <div className="flex flex-col gap-3 md:flex-row">
                                    <input
                                        value={businessQuestion}
                                        onChange={(e) => setBusinessQuestion(e.target.value)}
                                        className="input-field flex-1"
                                        placeholder="Example: Which variables most impact performance?"
                                    />
                                    <button
                                        onClick={handleBusinessQuestion}
                                        disabled={qaLoading || !businessQuestion.trim()}
                                        className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                                    >
                                        {qaLoading ? 'Answering...' : 'Answer'}
                                    </button>
                                </div>
                                {qaError && (
                                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                        Backend Q&A unavailable ({qaError}). Showing EDA-based fallback answer.
                                    </div>
                                )}
                                {businessAnswer && (
                                    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                                        {businessConfidence && (
                                            <div className="mb-2 flex items-center gap-2">
                                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${businessConfidence.tone === 'green'
                                                    ? 'bg-green-100 text-green-800'
                                                    : businessConfidence.tone === 'yellow'
                                                        ? 'bg-yellow-100 text-yellow-800'
                                                        : 'bg-red-100 text-red-800'
                                                    }`}>
                                                    Confidence: {businessConfidence.label} ({businessConfidence.score}%)
                                                </span>
                                            </div>
                                        )}
                                        {businessAnswer}
                                    </div>
                                )}
                            </div>

                            <div className="card">
                                <h3 className="text-lg font-semibold mb-4">Hypothesis Builder</h3>
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <div className="md:col-span-2">
                                        <label className="mb-1 block text-xs font-semibold text-slate-600">Hypothesis Statement</label>
                                        <input
                                            value={hypothesisText}
                                            onChange={(e) => setHypothesisText(e.target.value)}
                                            className="input-field"
                                            placeholder="Example: Higher marketing spend increases sales."
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold text-slate-600">Feature 1 (optional)</label>
                                        <select value={hypothesisFeature1} onChange={(e) => setHypothesisFeature1(e.target.value)} className="input-field">
                                            <option value="">Select feature...</option>
                                            {results.numericColumns.map((col) => <option key={`h1-${col}`} value={col}>{col}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold text-slate-600">Feature 2 (optional)</label>
                                        <select value={hypothesisFeature2} onChange={(e) => setHypothesisFeature2(e.target.value)} className="input-field">
                                            <option value="">Select feature...</option>
                                            {results.numericColumns.map((col) => <option key={`h2-${col}`} value={col}>{col}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <button onClick={handleHypothesisCheck} className="mt-3 rounded-lg bg-purple-600 px-4 py-2 font-semibold text-white hover:bg-purple-700">
                                    Evaluate Hypothesis
                                </button>

                                {hypothesisResult && (
                                    <div className={`mt-3 rounded-lg border p-3 text-sm ${hypothesisResult.status === 'supported'
                                        ? 'border-green-200 bg-green-50 text-green-900'
                                        : hypothesisResult.status === 'weak'
                                            ? 'border-yellow-200 bg-yellow-50 text-yellow-900'
                                            : 'border-red-200 bg-red-50 text-red-900'
                                        }`}>
                                        {hypothesisResult.message}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

export default AutoEDA
