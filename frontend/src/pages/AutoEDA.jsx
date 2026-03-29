import React, { useState, useMemo, useEffect, useRef } from 'react'
import { BarChart3, PieChart, TrendingUp, AlertCircle, CheckCircle, Activity, Zap, Target, Eye, Lightbulb, ArrowUp, ArrowDown, Minus, Filter, Download, RefreshCw } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, LineChart, Line, ScatterChart, Scatter, AreaChart, Area, RadialBarChart, RadialBar, Legend, ComposedChart } from 'recharts'
import { useAnalysis } from '../context/AnalysisContext'
import { chatAPI, queryAPI, sessionAPI, handleApiError } from '../services/api'

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
        return `Most missing data appears in ${topMissing.map((m) => `${m.name} (${m.percentage.toFixed(1)}%)`).join(', ')}.`
    }

    if (q.includes('correlation') || q.includes('related') || q.includes('impact')) {
        if (!topCorr) return 'Not enough numeric columns to evaluate variable relationships.'
        return `Strongest relationship: ${topCorr.feature1} vs ${topCorr.feature2} with ${topCorr.correlation.toFixed(3)} correlation (${topCorr.direction.toLowerCase()}).`
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
                message: `Hypothesis has support: ${feature1} and ${feature2} show ${pair.correlation.toFixed(3)} correlation (${pair.strength.toLowerCase()}).`
            }
        }
        return {
            status: 'weak',
            message: `Evidence is weak: correlation between ${feature1} and ${feature2} is ${pair.correlation.toFixed(3)}.`
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

function toNumber(value) {
    const n = Number.parseFloat(value)
    return Number.isFinite(n) ? n : null
}

function looksLikeDate(value) {
    if (value === null || value === undefined || value === '') return false
    const parsed = new Date(value)
    return !Number.isNaN(parsed.getTime())
}

function inferDateColumns(headers, rows) {
    const sampleRows = rows.slice(0, 80)
    return headers.filter((col) => {
        const values = sampleRows
            .map((r) => r[ col ])
            .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
        if (!values.length) return false
        const valid = values.filter((v) => looksLikeDate(v)).length
        return valid / values.length >= 0.7
    })
}

function pickNumericByKeyword(numericColumns, keywords) {
    const lowered = numericColumns.map((c) => c.toLowerCase())
    const found = lowered.find((col) => keywords.some((k) => col.includes(k)))
    if (!found) return null
    return numericColumns.find((c) => c.toLowerCase() === found) || null
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

            const correlationHeatmap = {
                labels: numericCols,
                values: numericCols.map((colA) => (
                    numericCols.map((colB) => {
                        if (colA === colB) return 1
                        const found = correlations.find((c) => (
                            (c.feature1 === colA && c.feature2 === colB) ||
                            (c.feature1 === colB && c.feature2 === colA)
                        ))
                        return found ? found.correlation : 0
                    })
                ))
            }

            const missingHeatmap = {
                labels: dataset.headers,
                rowLabels: dataset.rows.slice(0, 40).map((_, idx) => idx + 1),
                values: dataset.rows.slice(0, 40).map((row) => (
                    dataset.headers.map((h) => ((!row[ h ] || row[ h ] === '') ? 100 : 0))
                ))
            }

            // Categorical analysis
            const categoricalAnalysis = categoricalCols.map(col => {
                const valueCounts = {}
                dataset.rows.forEach(r => {
                    const val = r[ col ] || 'Missing'
                    valueCounts[ val ] = (valueCounts[ val ] || 0) + 1
                })
                const sorted = Object.entries(valueCounts).sort((a, b) => b[ 1 ] - a[ 1 ])

                const dateColumns = inferDateColumns(dataset.headers, dataset.rows)
                const primaryDateColumn = dateColumns[ 0 ] || null
                const revenueColumn = pickNumericByKeyword(numericCols, [ 'revenue', 'sales', 'amount', 'price', 'value', 'total' ])
                const customerColumn = categoricalCols.find((c) => /customer|client|user|account|buyer|member/i.test(c)) || null
                const regionColumn = categoricalCols.find((c) => /region|country|state|city|territory|zone/i.test(c)) || null
                const productColumn = categoricalCols.find((c) => /product|category|item|sku|brand|segment/i.test(c)) || null

                const trendInsights = []
                if (primaryDateColumn) {
                    const monthly = {}
                    dataset.rows.forEach((row) => {
                        const d = new Date(row[ primaryDateColumn ])
                        if (Number.isNaN(d.getTime())) return

                        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                        if (!monthly[ key ]) monthly[ key ] = { count: 0, metric: 0 }
                        monthly[ key ].count += 1

                        const metric = toNumber(row[ revenueColumn || numericCols[ 0 ] ])
                        if (metric !== null) monthly[ key ].metric += metric
                    })

                    const orderedMonths = Object.entries(monthly).sort((a, b) => a[ 0 ].localeCompare(b[ 0 ]))
                    if (orderedMonths.length >= 2) {
                        const first = orderedMonths[ 0 ][ 1 ].count
                        const last = orderedMonths[ orderedMonths.length - 1 ][ 1 ].count
                        const growth = first > 0 ? ((last - first) / first) * 100 : 0
                        trendInsights.push({
                            title: 'Monthly Activity Trend',
                            detail: `Activity changed by ${growth.toFixed(1)}% from ${orderedMonths[ 0 ][ 0 ]} to ${orderedMonths[ orderedMonths.length - 1 ][ 0 ]}.`,
                            confidence: Math.abs(growth) > 15 ? 'High' : 'Medium'
                        })

                        const peak = orderedMonths
                            .map(([ month, data ]) => ({ month, value: revenueColumn ? data.metric : data.count }))
                            .sort((a, b) => b.value - a.value)[ 0 ]
                        if (peak) {
                            trendInsights.push({
                                title: 'Peak Period',
                                detail: `${peak.month} is the strongest period based on ${revenueColumn ? revenueColumn : 'activity volume'}.`,
                                confidence: 'High'
                            })
                        }
                    }

                    const byMonthOfYear = Array(12).fill(0)
                    dataset.rows.forEach((row) => {
                        const d = new Date(row[ primaryDateColumn ])
                        if (!Number.isNaN(d.getTime())) {
                            byMonthOfYear[ d.getMonth() ] += 1
                        }
                    })
                    const maxMoY = Math.max(...byMonthOfYear)
                    const minMoY = Math.min(...byMonthOfYear)
                    if (maxMoY > 0 && (maxMoY - minMoY) / maxMoY > 0.35) {
                        const peakMonth = byMonthOfYear.indexOf(maxMoY)
                        const monthName = new Date(2026, peakMonth, 1).toLocaleString('en-US', { month: 'long' })
                        trendInsights.push({
                            title: 'Seasonality Signal',
                            detail: `Potential seasonality detected with peak activity around ${monthName}.`,
                            confidence: 'Medium'
                        })
                    }
                }

                const segmentationInsights = []
                const segmentationColumns = [ customerColumn, productColumn, regionColumn ].filter(Boolean)
                const segmentMetricColumn = revenueColumn || numericCols[ 0 ] || null
                segmentationColumns.slice(0, 3).forEach((col) => {
                    const buckets = {}
                    dataset.rows.forEach((row) => {
                        const key = String(row[ col ] ?? 'Missing').trim() || 'Missing'
                        if (!buckets[ key ]) buckets[ key ] = { count: 0, metric: 0 }
                        buckets[ key ].count += 1
                        const metric = segmentMetricColumn ? toNumber(row[ segmentMetricColumn ]) : null
                        if (metric !== null) buckets[ key ].metric += metric
                    })

                    const values = Object.entries(buckets)
                        .map(([ key, v ]) => ({ key, count: v.count, metric: v.metric }))
                        .sort((a, b) => (segmentMetricColumn ? b.metric - a.metric : b.count - a.count))

                    if (!values.length) return
                    const total = values.reduce((acc, v) => acc + (segmentMetricColumn ? v.metric : v.count), 0)
                    const top = values[ 0 ]
                    const second = values[ 1 ]

                    if (total > 0) {
                        const topShare = ((segmentMetricColumn ? top.metric : top.count) / total) * 100
                        segmentationInsights.push({
                            title: `${col} Leaders`,
                            detail: `${top.key} contributes ${topShare.toFixed(1)}% of ${segmentMetricColumn || 'records'} in this dataset.`,
                            confidence: topShare >= 40 ? 'High' : 'Medium'
                        })
                    }

                    if (second) {
                        const topVal = segmentMetricColumn ? top.metric : top.count
                        const secondVal = segmentMetricColumn ? second.metric : second.count
                        if (secondVal > 0) {
                            segmentationInsights.push({
                                title: `${col} Comparison`,
                                detail: `${top.key} performs ${(topVal / secondVal).toFixed(2)}x compared with ${second.key}.`,
                                confidence: 'Medium'
                            })
                        }
                    }

                    if (/customer|client|user|account|buyer|member/i.test(col) && values.length >= 5 && total > 0) {
                        const topN = Math.max(1, Math.ceil(values.length * 0.2))
                        const topSlice = values.slice(0, topN)
                        const topTotal = topSlice.reduce((acc, v) => acc + (segmentMetricColumn ? v.metric : v.count), 0)
                        const share = (topTotal / total) * 100
                        if (share >= 70) {
                            segmentationInsights.push({
                                title: 'Pareto-Like Segment Pattern',
                                detail: `Top 20% ${col} groups account for ${share.toFixed(1)}% of ${segmentMetricColumn || 'activity'}.`,
                                confidence: 'High'
                            })
                        }
                    }
                })

                const comparativeInsights = []
                if (regionColumn && segmentMetricColumn) {
                    const regionAgg = {}
                    dataset.rows.forEach((row) => {
                        const key = String(row[ regionColumn ] ?? 'Missing').trim() || 'Missing'
                        const metric = toNumber(row[ segmentMetricColumn ])
                        if (metric === null) return
                        regionAgg[ key ] = (regionAgg[ key ] || 0) + metric
                    })

                    const ranked = Object.entries(regionAgg).sort((a, b) => b[ 1 ] - a[ 1 ])
                    if (ranked.length >= 2 && ranked[ 1 ][ 1 ] > 0) {
                        comparativeInsights.push({
                            title: 'Region vs Region',
                            detail: `${ranked[ 0 ][ 0 ]} is ${(ranked[ 0 ][ 1 ] / ranked[ 1 ][ 1 ]).toFixed(2)}x stronger than ${ranked[ 1 ][ 0 ]} for ${segmentMetricColumn}.`,
                            confidence: 'High'
                        })
                    }
                }

                if (primaryDateColumn && segmentMetricColumn) {
                    const dated = dataset.rows
                        .map((row) => ({ d: new Date(row[ primaryDateColumn ]), m: toNumber(row[ segmentMetricColumn ]) }))
                        .filter((x) => !Number.isNaN(x.d.getTime()) && x.m !== null)
                        .sort((a, b) => a.d - b.d)

                    if (dated.length >= 6) {
                        const midpoint = Math.floor(dated.length / 2)
                        const before = dated.slice(0, midpoint)
                        const after = dated.slice(midpoint)
                        const avgBefore = before.reduce((acc, r) => acc + r.m, 0) / before.length
                        const avgAfter = after.reduce((acc, r) => acc + r.m, 0) / after.length
                        const change = avgBefore !== 0 ? ((avgAfter - avgBefore) / Math.abs(avgBefore)) * 100 : 0
                        comparativeInsights.push({
                            title: 'Before vs After Trend',
                            detail: `${segmentMetricColumn} changed by ${change.toFixed(1)}% when comparing earlier vs later periods.`,
                            confidence: Math.abs(change) >= 10 ? 'High' : 'Medium'
                        })
                    }
                }

                const behavioralInsights = []
                if (primaryDateColumn) {
                    let weekend = 0
                    let weekday = 0
                    dataset.rows.forEach((row) => {
                        const d = new Date(row[ primaryDateColumn ])
                        if (Number.isNaN(d.getTime())) return
                        const day = d.getDay()
                        if (day === 0 || day === 6) weekend += 1
                        else weekday += 1
                    })
                    const totalDays = weekend + weekday
                    if (totalDays > 0) {
                        const weekendShare = (weekend / totalDays) * 100
                        behavioralInsights.push({
                            title: 'Weekday vs Weekend Behavior',
                            detail: `${weekendShare.toFixed(1)}% of records occur on weekends (${weekend} weekend vs ${weekday} weekday).`,
                            confidence: 'Medium'
                        })
                    }
                }

                if (customerColumn) {
                    const freq = {}
                    dataset.rows.forEach((row) => {
                        const key = String(row[ customerColumn ] ?? '').trim()
                        if (!key) return
                        freq[ key ] = (freq[ key ] || 0) + 1
                    })
                    const counts = Object.values(freq)
                    if (counts.length) {
                        const repeatUsers = counts.filter((c) => c > 1).length
                        const repeatShare = (repeatUsers / counts.length) * 100
                        const avgFrequency = counts.reduce((acc, v) => acc + v, 0) / counts.length
                        behavioralInsights.push({
                            title: 'Repeat User Pattern',
                            detail: `${repeatShare.toFixed(1)}% of ${customerColumn} are repeat users with average frequency ${avgFrequency.toFixed(2)}.`,
                            confidence: repeatShare >= 40 ? 'High' : 'Medium'
                        })
                    }
                }
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
            const outlierScore = numericCols.length > 0
                ? 100 - (outlierTotal / (dataset.rowCount * numericCols.length) * 100)
                : 100
            const safeMissingScore = Number.isFinite(missingScore) ? missingScore : 0
            const safeDuplicateScore = Number.isFinite(duplicateScore) ? duplicateScore : 0
            const safeOutlierScore = Number.isFinite(outlierScore) ? outlierScore : 0
            const qualityScore = Math.round((safeMissingScore + safeDuplicateScore + safeOutlierScore) / 3)

            // Generate insights
            const insights = []
            if (missingData.some(m => m.percentage > 20)) insights.push({ type: 'warning', icon: AlertCircle, title: 'High Missing Data', desc: `${missingData.filter(m => m.percentage > 20).length} columns have >20% missing values`, action: 'Consider imputation or removal' })
            if (outlierTotal > dataset.rowCount * 0.05) insights.push({ type: 'warning', icon: AlertCircle, title: 'Outliers Detected', desc: `${outlierTotal} outliers found (${(outlierTotal / dataset.rowCount * 100).toFixed(1)}%)`, action: 'Review outlier treatment strategy' })
            if (correlations.some(c => Math.abs(c.correlation) > 0.9)) insights.push({ type: 'info', icon: TrendingUp, title: 'High Correlation', desc: 'Some features are highly correlated', action: 'Consider feature selection' })
            if (statistics.some(s => Math.abs(parseFloat(s.skewness)) > 1)) insights.push({ type: 'info', icon: Activity, title: 'Skewed Distributions', desc: 'Some features have skewed distributions', action: 'Consider log transformation' })
            if (qualityScore >= 80) insights.push({ type: 'success', icon: CheckCircle, title: 'Good Data Quality', desc: `Quality score: ${qualityScore}/100`, action: 'Data is ready for analysis' })
            if (numericCols.length >= 3) insights.push({ type: 'success', icon: Zap, title: 'ML Ready', desc: `${numericCols.length} numeric features available`, action: 'Suitable for machine learning' })

            if (numericCols.length === 0) {
                insights.push({
                    type: 'info',
                    icon: Lightbulb,
                    title: 'Categorical-Heavy Dataset',
                    desc: 'No numeric columns detected. Focus on category distributions and missing-value patterns.',
                    action: 'Use encoding or add numeric features before ML modeling'
                })
            }

            const strongestCorrelation = [ ...correlations ].sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))[ 0 ]
            if (strongestCorrelation) {
                insights.push({
                    type: 'info',
                    icon: TrendingUp,
                    title: 'Strongest Relationship',
                    desc: `${strongestCorrelation.feature1} and ${strongestCorrelation.feature2} show ${strongestCorrelation.correlation.toFixed(3)} correlation.`,
                    action: 'Validate whether this relationship is causal before acting on it'
                })
            }

            if (!insights.length) {
                insights.push({
                    type: 'success',
                    icon: CheckCircle,
                    title: 'Baseline Checks Complete',
                    desc: 'No major quality risks were detected from the current EDA checks.',
                    action: 'Proceed with targeted analysis or model experimentation'
                })
            }

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
                typeCount: [ { name: 'Numeric', value: numericCols.length }, { name: 'Categorical', value: categoricalCols.length } ],
                numericColumns: numericCols,
                dateColumns,
                correlationHeatmap,
                missingHeatmap,
                trendInsights,
                segmentationInsights,
                comparativeInsights,
                behavioralInsights
            }
            setResults(analysisResults)
            setEdaResults(analysisResults) // Save to global context for reports
            setBusinessAnswer('')
            setBusinessConfidence(null)
            setHypothesisResult(null)
            setAnalyzing(false)
        }, 2000)
    }

    const handleBusinessQuestion = async () => {
        const question = String(businessQuestion || '').trim()
        if (!question) return

        setQaError('')
        setQaLoading(true)

        const localAnswer = createBusinessAnswer(question, results)
        const confidence = scoreBusinessAnswerConfidence(question, results)
        const datasetId = dataset?.id || dataset?.datasetId || null

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

                            {(results.trendInsights?.length || results.segmentationInsights?.length || results.comparativeInsights?.length || results.behavioralInsights?.length) > 0 && (
                                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                                    {results.trendInsights?.length > 0 && (
                                        <div className="card">
                                            <h3 className="section-title mb-3">Trend Insights</h3>
                                            <div className="space-y-3">
                                                {results.trendInsights.map((item, idx) => (
                                                    <div key={`trend-${idx}`} className="rounded-lg bg-slate-50 p-3">
                                                        <p className="font-semibold text-slate-800">{item.title}</p>
                                                        <p className="mt-1 text-sm text-slate-600">{item.detail}</p>
                                                        <p className="mt-1 text-xs text-slate-500">Confidence: {item.confidence}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {results.segmentationInsights?.length > 0 && (
                                        <div className="card">
                                            <h3 className="section-title mb-3">Segmentation Insights</h3>
                                            <div className="space-y-3">
                                                {results.segmentationInsights.map((item, idx) => (
                                                    <div key={`seg-${idx}`} className="rounded-lg bg-slate-50 p-3">
                                                        <p className="font-semibold text-slate-800">{item.title}</p>
                                                        <p className="mt-1 text-sm text-slate-600">{item.detail}</p>
                                                        <p className="mt-1 text-xs text-slate-500">Confidence: {item.confidence}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {results.comparativeInsights?.length > 0 && (
                                        <div className="card">
                                            <h3 className="section-title mb-3">Comparative Insights</h3>
                                            <div className="space-y-3">
                                                {results.comparativeInsights.map((item, idx) => (
                                                    <div key={`cmp-${idx}`} className="rounded-lg bg-slate-50 p-3">
                                                        <p className="font-semibold text-slate-800">{item.title}</p>
                                                        <p className="mt-1 text-sm text-slate-600">{item.detail}</p>
                                                        <p className="mt-1 text-xs text-slate-500">Confidence: {item.confidence}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {results.behavioralInsights?.length > 0 && (
                                        <div className="card">
                                            <h3 className="section-title mb-3">Behavioral Insights</h3>
                                            <div className="space-y-3">
                                                {results.behavioralInsights.map((item, idx) => (
                                                    <div key={`bhv-${idx}`} className="rounded-lg bg-slate-50 p-3">
                                                        <p className="font-semibold text-slate-800">{item.title}</p>
                                                        <p className="mt-1 text-sm text-slate-600">{item.detail}</p>
                                                        <p className="mt-1 text-xs text-slate-500">Confidence: {item.confidence}</p>
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
                                {results.correlationHeatmap.labels.length > 1 ? (
                                    <div className="overflow-auto">
                                        <div className="inline-grid gap-1" style={{ gridTemplateColumns: `120px repeat(${results.correlationHeatmap.labels.length}, minmax(56px, 56px))` }}>
                                            <div className="bg-white" />
                                            {results.correlationHeatmap.labels.map((label) => (
                                                <div key={`hx-${label}`} className="text-[10px] font-semibold text-slate-600 text-center truncate" title={label}>{label}</div>
                                            ))}
                                            {results.correlationHeatmap.labels.map((rowLabel, rIdx) => (
                                                <React.Fragment key={`row-${rowLabel}`}>
                                                    <div className="text-[10px] font-semibold text-slate-600 truncate pr-2" title={rowLabel}>{rowLabel}</div>
                                                    {results.correlationHeatmap.values[ rIdx ].map((value, cIdx) => (
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
                                        <ResponsiveContainer width="100%" height={380}>
                                            <>
                                                {vizChartType === 'bar' && (
                                                    <BarChart data={vizData}>
                                                        <CartesianGrid strokeDasharray="3 3" />
                                                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                                        <YAxis />
                                                        <Tooltip />
                                                        <Bar dataKey="value" fill="#6366f1" radius={[ 6, 6, 0, 0 ]} />
                                                    </BarChart>
                                                )}

                                                {vizChartType === 'line' && (
                                                    <LineChart data={vizData}>
                                                        <CartesianGrid strokeDasharray="3 3" />
                                                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                                        <YAxis />
                                                        <Tooltip />
                                                        <Line type="monotone" dataKey="value" stroke="#06b6d4" strokeWidth={3} dot={false} />
                                                    </LineChart>
                                                )}

                                                {vizChartType === 'area' && (
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
                                                )}

                                                {vizChartType === 'pie' && (
                                                    <RechartsPie>
                                                        <Tooltip />
                                                        <Legend />
                                                        <Pie data={vizData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={130} label>
                                                            {vizData.map((_, idx) => <Cell key={`viz-pie-${idx}`} fill={COLORS[ idx % COLORS.length ]} />)}
                                                        </Pie>
                                                    </RechartsPie>
                                                )}

                                                {vizChartType === 'scatter' && (
                                                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                                        <CartesianGrid strokeDasharray="3 3" />
                                                        <XAxis dataKey="x" name={vizXColumn} type="number" />
                                                        <YAxis dataKey="y" name={vizYColumn} type="number" />
                                                        <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                                                        <Scatter data={vizData} fill="#f97316" />
                                                    </ScatterChart>
                                                )}
                                            </>
                                        </ResponsiveContainer>
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
