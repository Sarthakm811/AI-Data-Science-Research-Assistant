import React, { useMemo, useState } from 'react'
import { Calculator, Sigma, TrendingUp, AlertCircle } from 'lucide-react'
import {
    ResponsiveContainer,
    LineChart,
    Line,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
    BarChart,
    Bar,
    Cell
} from 'recharts'
import { useAnalysis } from '../context/AnalysisContext'
import { statisticsAPI } from '../services/api'

function inferColumns(dataset) {
    const headers = dataset?.headers || []
    const rows = dataset?.rows || []

    const numeric = []
    const categorical = []
    const datetimeLike = []

    headers.forEach((col) => {
        const values = rows.map((r) => r?.[ col ]).filter((v) => v != null && String(v).trim() !== '')
        if (!values.length) {
            categorical.push(col)
            return
        }

        const numericCount = values.filter((v) => Number.isFinite(Number(v))).length
        const numericRatio = numericCount / values.length
        if (numericRatio >= 0.85) {
            numeric.push(col)
        } else {
            categorical.push(col)
        }

        const datetimeCount = values.filter((v) => !Number.isNaN(Date.parse(String(v)))).length
        if (datetimeCount / values.length >= 0.75) {
            datetimeLike.push(col)
        }
    })

    return { numeric, categorical, datetimeLike }
}

function SectionCard({ title, children, icon: Icon = Sigma }) {
    return (
        <section className="card">
            <div className="mb-3 flex items-center gap-2">
                <Icon size={18} className="text-slate-600" />
                <h3 className="section-title">{title}</h3>
            </div>
            {children}
        </section>
    )
}

function KeyValueGrid({ data }) {
    if (!data || Object.keys(data).length === 0) {
        return <p className="text-sm text-slate-500">No output available.</p>
    }

    return (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {Object.entries(data).map(([ key, value ]) => (
                <div key={key} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{key}</p>
                    <p className="mt-1 break-words text-slate-800">
                        {typeof value === 'number'
                            ? Number(value).toFixed(6)
                            : Array.isArray(value)
                                ? JSON.stringify(value)
                                : typeof value === 'object' && value !== null
                                    ? JSON.stringify(value)
                                    : String(value)}
                    </p>
                </div>
            ))}
        </div>
    )
}

function StatisticsMath({ dataset }) {
    const [ loading, setLoading ] = useState(false)
    const [ error, setError ] = useState(null)
    const [ results, setResults ] = useState(null)
    const { setStatsMathResults } = useAnalysis()

    const columns = useMemo(() => inferColumns(dataset), [ dataset ])

    const [ config, setConfig ] = useState({
        numericColumn: '',
        groupColumn: '',
        categoricalColumn: '',
        timeColumn: '',
        probabilityValue: '',
        confidenceLevel: 0.95,
        abGroupColumn: '',
        abOutcomeColumn: '',
        controlLabel: '',
        variantLabel: '',
        priorAlpha: 1,
        priorBeta: 1,
        arimaOrder: '1,1,1',
        sarimaOrder: '1,1,1',
        seasonalOrder: '1,1,1',
        seasonalPeriod: 12,
        forecastSteps: 12,
        matrixColumns: [],
        vectorColumns: []
    })

    const runAnalysis = async () => {
        if (!dataset?.id) {
            setError('Dataset ID is missing. Please upload/search and select a backend dataset first.')
            return
        }

        setLoading(true)
        setError(null)
        setResults(null)
        setStatsMathResults(null)

        try {
            const parseOrder = (text, fallback) => {
                const parts = String(text || '')
                    .split(',')
                    .map((v) => Number(v.trim()))
                    .filter((v) => Number.isFinite(v))
                return parts.length >= 3 ? parts.slice(0, 3) : fallback
            }

            const data = await statisticsAPI.analyze(dataset.id, {
                numeric_column: config.numericColumn || null,
                group_column: config.groupColumn || null,
                categorical_column: config.categoricalColumn || null,
                time_column: config.timeColumn || null,
                probability_value: config.probabilityValue === '' ? null : Number(config.probabilityValue),
                confidence_level: Number(config.confidenceLevel),
                ab_group_column: config.abGroupColumn || null,
                ab_outcome_column: config.abOutcomeColumn || null,
                control_label: config.controlLabel || null,
                variant_label: config.variantLabel || null,
                prior_alpha: Number(config.priorAlpha),
                prior_beta: Number(config.priorBeta),
                arima_order: parseOrder(config.arimaOrder, [ 1, 1, 1 ]),
                sarima_order: parseOrder(config.sarimaOrder, [ 1, 1, 1 ]),
                seasonal_order: parseOrder(config.seasonalOrder, [ 1, 1, 1 ]),
                seasonal_period: Number(config.seasonalPeriod),
                forecast_steps: Number(config.forecastSteps),
                matrix_columns: config.matrixColumns.length ? config.matrixColumns : null,
                vector_columns: config.vectorColumns.length ? config.vectorColumns : null,
            })

            setResults(data)
            setStatsMathResults(data)
        } catch (err) {
            setError(err?.message || 'Analysis failed')
        } finally {
            setLoading(false)
        }
    }

    const downloadTextFile = (filename, content, mimeType = 'text/plain;charset=utf-8') => {
        const blob = new Blob([ content ], { type: mimeType })
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.URL.revokeObjectURL(url)
    }

    const toCsv = (rows) => {
        if (!Array.isArray(rows) || rows.length === 0) return ''

        const headers = Array.from(
            rows.reduce((acc, row) => {
                Object.keys(row || {}).forEach((key) => acc.add(key))
                return acc
            }, new Set())
        )

        const escapeCell = (value) => {
            const text = value == null ? '' : String(value)
            if (text.includes(',') || text.includes('"') || text.includes('\n')) {
                return `"${text.replace(/"/g, '""')}"`
            }
            return text
        }

        const lines = [
            headers.map(escapeCell).join(','),
            ...rows.map((row) => headers.map((h) => escapeCell(row?.[ h ])).join(','))
        ]

        return lines.join('\n')
    }

    const exportRowsAsJson = (rows, filenameStem) => {
        const body = JSON.stringify(rows || [], null, 2)
        downloadTextFile(`${filenameStem}.json`, body, 'application/json;charset=utf-8')
    }

    const exportRowsAsCsv = (rows, filenameStem) => {
        const csv = toCsv(rows)
        downloadTextFile(`${filenameStem}.csv`, csv, 'text/csv;charset=utf-8')
    }

    const forecastChartData = useMemo(() => {
        if (!results?.time_series) return []

        const arimaForecast = results.time_series?.arima?.forecast || []
        const sarimaForecast = results.time_series?.sarima?.forecast || []
        const maxLen = Math.max(arimaForecast.length, sarimaForecast.length)

        return Array.from({ length: maxLen }, (_, idx) => ({
            step: idx + 1,
            arima: arimaForecast[ idx ] != null ? Number(arimaForecast[ idx ]) : null,
            sarima: sarimaForecast[ idx ] != null ? Number(sarimaForecast[ idx ]) : null,
        }))
    }, [ results ])

    const abChartData = useMemo(() => {
        if (!results?.ab_test?.control || !results?.ab_test?.variant) return []
        return [
            {
                name: results.ab_test.control_label || 'Control',
                rate: Number(results.ab_test.control.rate || 0),
                count: Number(results.ab_test.control.n || 0),
            },
            {
                name: results.ab_test.variant_label || 'Variant',
                rate: Number(results.ab_test.variant.rate || 0),
                count: Number(results.ab_test.variant.n || 0),
            },
        ]
    }, [ results ])

    const correlationMatrixTable = useMemo(() => {
        const cols = results?.linear_algebra?.matrix_columns || []
        const matrix = results?.linear_algebra?.correlation_matrix || []
        if (!Array.isArray(cols) || !Array.isArray(matrix) || cols.length < 2 || matrix.length < 2) {
            return null
        }

        return {
            columns: cols,
            matrix,
        }
    }, [ results ])

    const correlationColor = (value) => {
        const v = Number(value)
        if (!Number.isFinite(v)) return 'rgb(241,245,249)'
        const clamped = Math.max(-1, Math.min(1, v))

        if (clamped >= 0) {
            const intensity = Math.round(255 - (clamped * 120))
            return `rgb(${intensity}, ${255 - Math.round(clamped * 55)}, 255)`
        }

        const intensity = Math.round(255 - (Math.abs(clamped) * 120))
        return `rgb(255, ${intensity}, ${intensity})`
    }

    if (!dataset) {
        return (
            <div className="card border-amber-200 bg-amber-50 text-amber-800">
                <p className="font-semibold">No dataset selected</p>
                <p className="mt-1 text-sm">Please load a dataset first to run statistics and mathematics modules.</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="card hero-contrast bg-gradient-to-r from-blue-800 via-teal-700 to-orange-600 text-white">
                <div className="mb-4 flex items-center gap-3">
                    <Calculator size={24} className="text-cyan-100" />
                    <div>
                        <h1 className="title-display text-2xl font-bold text-white">Statistics and Mathematics Lab</h1>
                        <p className="text-sm text-cyan-100">Probability, hypothesis testing, confidence intervals, A/B testing, Bayesian analysis, time series, and linear algebra.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <select className="input-field" value={config.numericColumn} onChange={(e) => setConfig((p) => ({ ...p, numericColumn: e.target.value }))}>
                        <option value="">Numeric column</option>
                        {columns.numeric.map((col) => <option key={col} value={col}>{col}</option>)}
                    </select>
                    <select className="input-field" value={config.groupColumn} onChange={(e) => setConfig((p) => ({ ...p, groupColumn: e.target.value }))}>
                        <option value="">Group column</option>
                        {columns.categorical.map((col) => <option key={col} value={col}>{col}</option>)}
                    </select>
                    <select className="input-field" value={config.categoricalColumn} onChange={(e) => setConfig((p) => ({ ...p, categoricalColumn: e.target.value }))}>
                        <option value="">Categorical column</option>
                        {columns.categorical.map((col) => <option key={col} value={col}>{col}</option>)}
                    </select>
                    <select className="input-field" value={config.timeColumn} onChange={(e) => setConfig((p) => ({ ...p, timeColumn: e.target.value }))}>
                        <option value="">Time column</option>
                        {columns.datetimeLike.map((col) => <option key={col} value={col}>{col}</option>)}
                    </select>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-5">
                    <input className="input-field" type="number" step="any" placeholder="Probability value" value={config.probabilityValue} onChange={(e) => setConfig((p) => ({ ...p, probabilityValue: e.target.value }))} />
                    <input className="input-field" type="number" min="0.5" max="0.999" step="0.01" placeholder="Confidence level" value={config.confidenceLevel} onChange={(e) => setConfig((p) => ({ ...p, confidenceLevel: e.target.value }))} />
                    <input className="input-field" placeholder="ARIMA order (p,d,q)" value={config.arimaOrder} onChange={(e) => setConfig((p) => ({ ...p, arimaOrder: e.target.value }))} />
                    <input className="input-field" placeholder="SARIMA order (p,d,q)" value={config.sarimaOrder} onChange={(e) => setConfig((p) => ({ ...p, sarimaOrder: e.target.value }))} />
                    <input className="input-field" placeholder="Seasonal order (P,D,Q)" value={config.seasonalOrder} onChange={(e) => setConfig((p) => ({ ...p, seasonalOrder: e.target.value }))} />
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                    <select className="input-field" value={config.abGroupColumn} onChange={(e) => setConfig((p) => ({ ...p, abGroupColumn: e.target.value }))}>
                        <option value="">A/B group column</option>
                        {columns.categorical.map((col) => <option key={col} value={col}>{col}</option>)}
                    </select>
                    <select className="input-field" value={config.abOutcomeColumn} onChange={(e) => setConfig((p) => ({ ...p, abOutcomeColumn: e.target.value }))}>
                        <option value="">A/B outcome column</option>
                        {dataset.headers.map((col) => <option key={col} value={col}>{col}</option>)}
                    </select>
                    <input className="input-field" placeholder="Control label (optional)" value={config.controlLabel} onChange={(e) => setConfig((p) => ({ ...p, controlLabel: e.target.value }))} />
                    <input className="input-field" placeholder="Variant label (optional)" value={config.variantLabel} onChange={(e) => setConfig((p) => ({ ...p, variantLabel: e.target.value }))} />
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                    <input className="input-field" type="number" step="0.1" placeholder="Bayesian prior alpha" value={config.priorAlpha} onChange={(e) => setConfig((p) => ({ ...p, priorAlpha: e.target.value }))} />
                    <input className="input-field" type="number" step="0.1" placeholder="Bayesian prior beta" value={config.priorBeta} onChange={(e) => setConfig((p) => ({ ...p, priorBeta: e.target.value }))} />
                    <input className="input-field" type="number" min="2" max="60" placeholder="Seasonal period" value={config.seasonalPeriod} onChange={(e) => setConfig((p) => ({ ...p, seasonalPeriod: e.target.value }))} />
                    <input className="input-field" type="number" min="3" max="60" placeholder="Forecast steps" value={config.forecastSteps} onChange={(e) => setConfig((p) => ({ ...p, forecastSteps: e.target.value }))} />
                </div>

                <div className="mt-3 rounded-lg border border-white/20 bg-white/12 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-cyan-100">Linear Algebra Columns</p>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                        {columns.numeric.map((col) => (
                            <label key={col} className="flex items-center gap-2 text-sm text-cyan-50">
                                <input
                                    type="checkbox"
                                    checked={config.matrixColumns.includes(col)}
                                    onChange={(e) => setConfig((prev) => ({
                                        ...prev,
                                        matrixColumns: e.target.checked
                                            ? [ ...prev.matrixColumns, col ]
                                            : prev.matrixColumns.filter((c) => c !== col),
                                    }))}
                                />
                                {col}
                            </label>
                        ))}
                    </div>
                </div>

                <button
                    type="button"
                    onClick={runAnalysis}
                    disabled={loading}
                    className="btn-primary mt-4 inline-flex items-center gap-2 text-sm disabled:opacity-60"
                >
                    <TrendingUp size={16} />
                    {loading ? 'Running analysis...' : 'Run Statistics and Mathematics'}
                </button>

                {error && (
                    <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                        {error}
                    </div>
                )}
            </div>

            {results && (
                <>
                    {Array.isArray(results.warnings) && results.warnings.length > 0 && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                            <div className="mb-2 flex items-center gap-2 text-amber-800">
                                <AlertCircle size={16} />
                                <p className="font-semibold">Analysis warnings</p>
                            </div>
                            <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">
                                {results.warnings.map((w, idx) => <li key={`${w}-${idx}`}>{w}</li>)}
                            </ul>
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <SectionCard title="Probability Concepts" icon={Sigma}>
                            <KeyValueGrid data={results.probability} />
                        </SectionCard>

                        <SectionCard title="Confidence Intervals" icon={Sigma}>
                            <KeyValueGrid data={results.confidence_intervals} />
                        </SectionCard>

                        <SectionCard title="Hypothesis Testing (T-test, Chi-square, ANOVA)" icon={Sigma}>
                            <KeyValueGrid data={results.hypothesis_testing} />
                        </SectionCard>

                        <SectionCard title="A/B Test Analysis" icon={Sigma}>
                            <KeyValueGrid data={results.ab_test} />
                            {abChartData.length > 0 && (
                                <div className="mt-4 h-64 rounded-lg border border-slate-200 bg-white p-3">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={abChartData} margin={{ top: 8, right: 20, left: 0, bottom: 8 }}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="name" />
                                            <YAxis domain={[ 0, 1 ]} />
                                            <Tooltip
                                                formatter={(value, key, ctx) => {
                                                    if (key === 'rate') {
                                                        return [ `${(Number(value) * 100).toFixed(2)}%`, 'Conversion Rate' ]
                                                    }
                                                    return [ value, key ]
                                                }}
                                                labelFormatter={(label) => `Group: ${label}`}
                                            />
                                            <Legend />
                                            <Bar dataKey="rate" name="Conversion Rate">
                                                {abChartData.map((entry, idx) => (
                                                    <Cell key={`ab-rate-${idx}`} fill={idx === 0 ? '#2563eb' : '#059669'} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                            {abChartData.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() => exportRowsAsCsv(abChartData, 'ab_test_chart_data')}
                                        className="btn-secondary rounded-md px-3 py-1.5 text-xs"
                                    >
                                        Export A/B CSV
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => exportRowsAsJson(abChartData, 'ab_test_chart_data')}
                                        className="btn-secondary rounded-md px-3 py-1.5 text-xs"
                                    >
                                        Export A/B JSON
                                    </button>
                                </div>
                            )}
                        </SectionCard>

                        <SectionCard title="Bayesian Statistics" icon={Sigma}>
                            <KeyValueGrid data={results.bayesian} />
                        </SectionCard>

                        <SectionCard title="Time Series (ARIMA / SARIMA)" icon={Sigma}>
                            <KeyValueGrid data={results.time_series} />
                            {forecastChartData.length > 0 && (
                                <div className="mt-4 h-72 rounded-lg border border-slate-200 bg-white p-3">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={forecastChartData} margin={{ top: 8, right: 20, left: 0, bottom: 8 }}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="step" label={{ value: 'Forecast Step', position: 'insideBottom', offset: -5 }} />
                                            <YAxis />
                                            <Tooltip formatter={(v) => Number(v).toFixed(4)} />
                                            <Legend />
                                            <Line type="monotone" dataKey="arima" stroke="#2563eb" strokeWidth={2} dot={false} name="ARIMA" />
                                            <Line type="monotone" dataKey="sarima" stroke="#db2777" strokeWidth={2} dot={false} name="SARIMA" />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                            {forecastChartData.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() => exportRowsAsCsv(forecastChartData, 'time_series_forecast_data')}
                                        className="btn-secondary rounded-md px-3 py-1.5 text-xs"
                                    >
                                        Export Forecast CSV
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => exportRowsAsJson(forecastChartData, 'time_series_forecast_data')}
                                        className="btn-secondary rounded-md px-3 py-1.5 text-xs"
                                    >
                                        Export Forecast JSON
                                    </button>
                                </div>
                            )}
                        </SectionCard>
                    </div>

                    <SectionCard title="Linear Algebra (Matrices / Vectors)" icon={Sigma}>
                        <KeyValueGrid data={results.linear_algebra} />
                        {correlationMatrixTable && (
                            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                                <table className="w-full min-w-[560px] text-sm">
                                    <thead>
                                        <tr>
                                            <th className="border-b border-r bg-slate-100 px-3 py-2 text-left font-semibold text-slate-700">Feature</th>
                                            {correlationMatrixTable.columns.map((col) => (
                                                <th key={`corr-h-${col}`} className="border-b bg-slate-100 px-3 py-2 text-left font-semibold text-slate-700">{col}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {correlationMatrixTable.columns.map((rowName, rIdx) => (
                                            <tr key={`corr-r-${rowName}`}>
                                                <td className="border-r bg-slate-50 px-3 py-2 font-semibold text-slate-700">{rowName}</td>
                                                {correlationMatrixTable.columns.map((_, cIdx) => {
                                                    const value = correlationMatrixTable.matrix?.[ rIdx ]?.[ cIdx ]
                                                    const bg = correlationColor(value)
                                                    return (
                                                        <td
                                                            key={`corr-c-${rIdx}-${cIdx}`}
                                                            className="px-3 py-2 text-slate-900"
                                                            style={{ backgroundColor: bg }}
                                                        >
                                                            {value == null ? 'N/A' : Number(value).toFixed(3)}
                                                        </td>
                                                    )
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {correlationMatrixTable && (
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const matrixRows = correlationMatrixTable.columns.map((rowName, rIdx) => {
                                            const base = { feature: rowName }
                                            correlationMatrixTable.columns.forEach((colName, cIdx) => {
                                                base[ colName ] = correlationMatrixTable.matrix?.[ rIdx ]?.[ cIdx ]
                                            })
                                            return base
                                        })
                                        exportRowsAsCsv(matrixRows, 'correlation_matrix_data')
                                    }}
                                    className="btn-secondary rounded-md px-3 py-1.5 text-xs"
                                >
                                    Export Correlation CSV
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const matrixRows = correlationMatrixTable.columns.map((rowName, rIdx) => {
                                            const base = { feature: rowName }
                                            correlationMatrixTable.columns.forEach((colName, cIdx) => {
                                                base[ colName ] = correlationMatrixTable.matrix?.[ rIdx ]?.[ cIdx ]
                                            })
                                            return base
                                        })
                                        exportRowsAsJson(matrixRows, 'correlation_matrix_data')
                                    }}
                                    className="btn-secondary rounded-md px-3 py-1.5 text-xs"
                                >
                                    Export Correlation JSON
                                </button>
                            </div>
                        )}
                    </SectionCard>
                </>
            )}
        </div>
    )
}

export default StatisticsMath
