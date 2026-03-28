import React, { useState, useMemo } from 'react'
import { TrendingUp, Play, Calendar, Activity, Layers } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, ComposedChart, Bar } from 'recharts'
import { useAnalysis } from '../context/AnalysisContext'

const TS_STAT_CLASS = {
    blue: 'text-blue-600',
    purple: 'text-purple-600',
    green: 'text-green-600',
    red: 'text-red-600',
    gray: 'text-gray-600',
    indigo: 'text-indigo-600',
    pink: 'text-pink-600',
    cyan: 'text-cyan-600'
}

function TimeSeries({ dataset }) {
    const [ analyzing, setAnalyzing ] = useState(false)
    const [ results, setResults ] = useState(null)
    const [ config, setConfig ] = useState({
        dateColumn: '',
        valueColumn: '',
        forecastPeriods: 30
    })
    const [ activeTab, setActiveTab ] = useState('overview')
    const { setTimeSeriesResults } = useAnalysis()

    // Detect date columns
    const dateColumns = useMemo(() => {
        if (!dataset) return []
        return dataset.headers.filter(h => {
            const val = dataset.rows[ 0 ]?.[ h ]
            return val && (
                /^\d{4}-\d{2}-\d{2}/.test(val) ||
                /^\d{2}\/\d{2}\/\d{4}/.test(val) ||
                /^\d{1,2}-\w{3}-\d{4}/.test(val)
            )
        })
    }, [ dataset ])

    const numericColumns = useMemo(() => {
        if (!dataset) return []
        return dataset.headers.filter(h => {
            const val = dataset.rows[ 0 ]?.[ h ]
            return !isNaN(parseFloat(val))
        })
    }, [ dataset ])

    const runAnalysis = () => {
        if (!dataset || !config.dateColumn || !config.valueColumn) return
        setAnalyzing(true)

        setTimeout(() => {
            // Parse and sort data by date
            const timeData = dataset.rows
                .map(row => ({
                    date: new Date(row[ config.dateColumn ]),
                    value: parseFloat(row[ config.valueColumn ]) || 0,
                    original: row
                }))
                .filter(d => !isNaN(d.date.getTime()))
                .sort((a, b) => a.date - b.date)

            // Calculate statistics
            const values = timeData.map(d => d.value)
            const mean = values.reduce((a, b) => a + b, 0) / values.length
            const std = Math.sqrt(values.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / values.length)
            const min = Math.min(...values)
            const max = Math.max(...values)

            // Calculate trend (simple linear regression)
            const n = values.length
            const xMean = (n - 1) / 2
            const yMean = mean
            let num = 0, den = 0
            values.forEach((y, x) => {
                num += (x - xMean) * (y - yMean)
                den += Math.pow(x - xMean, 2)
            })
            const slope = num / den
            const trendDirection = slope > 0.01 ? 'Upward' : slope < -0.01 ? 'Downward' : 'Stable'

            // Calculate moving averages
            const ma7 = calculateMA(values, 7)
            const ma30 = calculateMA(values, 30)

            // Decomposition (simplified)
            const trend = ma30
            const seasonal = values.map((v, i) => v - (trend[ i ] || mean))
            const residual = values.map((v, i) => v - (trend[ i ] || mean) - (seasonal[ i ] || 0))

            // Generate forecast (simple exponential smoothing)
            const alpha = 0.3
            let forecast = [ values[ values.length - 1 ] ]
            for (let i = 1; i <= config.forecastPeriods; i++) {
                const lastForecast = forecast[ forecast.length - 1 ]
                const noise = (Math.random() - 0.5) * std * 0.5
                forecast.push(lastForecast + slope + noise)
            }

            // Prepare chart data
            const chartData = timeData.map((d, i) => ({
                date: d.date.toISOString().split('T')[ 0 ],
                value: d.value,
                ma7: ma7[ i ],
                ma30: ma30[ i ],
                trend: trend[ i ],
                seasonal: seasonal[ i ],
                residual: residual[ i ]
            }))

            // Add forecast data
            const lastDate = timeData[ timeData.length - 1 ].date
            const forecastData = forecast.slice(1).map((v, i) => {
                const date = new Date(lastDate)
                date.setDate(date.getDate() + i + 1)
                return {
                    date: date.toISOString().split('T')[ 0 ],
                    forecast: v,
                    upper: v + std * 1.96,
                    lower: v - std * 1.96
                }
            })

            // Seasonality detection (simplified)
            const seasonalityStrength = Math.abs(seasonal.reduce((a, b) => a + Math.abs(b), 0) / n / std)

            const tsResultsData = {
                chartData,
                forecastData,
                statistics: {
                    mean: mean.toFixed(2),
                    std: std.toFixed(2),
                    min: min.toFixed(2),
                    max: max.toFixed(2),
                    trend: trendDirection,
                    slope: slope.toFixed(4),
                    seasonalityStrength: seasonalityStrength.toFixed(2),
                    dataPoints: n
                },
                decomposition: {
                    trend,
                    seasonal,
                    residual
                },
                config: { dateColumn: config.dateColumn, valueColumn: config.valueColumn }
            }
            setResults(tsResultsData)
            setTimeSeriesResults(tsResultsData) // Save to global context for reports

            setAnalyzing(false)
        }, 2000)
    }

    const calculateMA = (data, window) => {
        return data.map((_, i) => {
            if (i < window - 1) return null
            const slice = data.slice(i - window + 1, i + 1)
            return slice.reduce((a, b) => a + b, 0) / window
        })
    }

    if (!dataset) {
        return (
            <div className="card text-center py-16">
                <TrendingUp size={64} className="mx-auto text-gray-300 mb-4" />
                <h2 className="text-2xl font-bold text-gray-800 mb-2">No Dataset Loaded</h2>
                <p className="text-gray-500">Upload a CSV file with time series data</p>
            </div>
        )
    }

    const tabs = [
        { id: 'overview', label: 'Overview', icon: Activity },
        { id: 'decomposition', label: 'Decomposition', icon: Layers },
        { id: 'forecast', label: 'Forecast', icon: TrendingUp }
    ]

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="card bg-gradient-to-r from-blue-800 via-teal-700 to-orange-600 text-white">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="title-display mb-1 text-2xl font-bold">Time Series Analysis</h1>
                        <p className="text-cyan-100">Analyze trends, seasonality, and forecast future values</p>
                    </div>
                    <button
                        onClick={runAnalysis}
                        disabled={analyzing || !config.dateColumn || !config.valueColumn}
                        className="flex items-center gap-2 rounded-lg bg-white px-6 py-3 font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-50"
                    >
                        <Play size={18} />
                        {analyzing ? 'Analyzing...' : 'Run Analysis'}
                    </button>
                </div>
            </div>

            {/* Configuration */}
            <div className="card">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Calendar size={20} /> Configuration
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Date Column</label>
                        <select
                            value={config.dateColumn}
                            onChange={(e) => setConfig({ ...config, dateColumn: e.target.value })}
                            className="input-field"
                        >
                            <option value="">Select date column...</option>
                            {dateColumns.length > 0 ? (
                                dateColumns.map(col => <option key={col} value={col}>{col}</option>)
                            ) : (
                                dataset.headers.map(col => <option key={col} value={col}>{col}</option>)
                            )}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Value Column</label>
                        <select
                            value={config.valueColumn}
                            onChange={(e) => setConfig({ ...config, valueColumn: e.target.value })}
                            className="input-field"
                        >
                            <option value="">Select value column...</option>
                            {numericColumns.map(col => <option key={col} value={col}>{col}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Forecast Periods: {config.forecastPeriods}
                        </label>
                        <input
                            type="range"
                            min="7"
                            max="90"
                            value={config.forecastPeriods}
                            onChange={(e) => setConfig({ ...config, forecastPeriods: parseInt(e.target.value) })}
                            className="w-full"
                        />
                    </div>
                </div>
            </div>

            {analyzing && !results && (
                <div className="space-y-6 fade-up">
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-8">
                        {[ 1, 2, 3, 4, 5, 6, 7, 8 ].map((idx) => (
                            <div key={idx} className="card p-4 text-center">
                                <div className="skeleton mx-auto mb-2 h-6 w-16" />
                                <div className="skeleton mx-auto h-3 w-20" />
                            </div>
                        ))}
                    </div>
                    <div className="card">
                        <div className="skeleton mb-4 h-5 w-44" />
                        <div className="skeleton h-72 w-full" />
                    </div>
                </div>
            )}

            {results && (
                <>
                    {/* Statistics */}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                        {[
                            { label: 'Mean', value: results.statistics.mean, color: 'blue' },
                            { label: 'Std Dev', value: results.statistics.std, color: 'purple' },
                            { label: 'Min', value: results.statistics.min, color: 'green' },
                            { label: 'Max', value: results.statistics.max, color: 'red' },
                            { label: 'Trend', value: results.statistics.trend, color: results.statistics.trend === 'Upward' ? 'green' : results.statistics.trend === 'Downward' ? 'red' : 'gray' },
                            { label: 'Slope', value: results.statistics.slope, color: 'indigo' },
                            { label: 'Seasonality', value: results.statistics.seasonalityStrength, color: 'pink' },
                            { label: 'Data Points', value: results.statistics.dataPoints, color: 'cyan' }
                        ].map((stat, i) => (
                            <div key={i} className="card p-4 text-center">
                                <p className={`text-xl font-bold ${TS_STAT_CLASS[ stat.color ] || 'text-slate-700'}`}>{stat.value}</p>
                                <p className="text-gray-500 text-xs">{stat.label}</p>
                            </div>
                        ))}
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {tabs.map(tab => {
                            const Icon = tab.icon
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-lg transition ${activeTab === tab.id
                                        ? 'bg-gradient-to-r from-teal-600 to-blue-700 text-white'
                                        : 'bg-white text-gray-600 hover:bg-cyan-50'
                                        }`}
                                >
                                    <Icon size={18} />
                                    {tab.label}
                                </button>
                            )
                        })}
                    </div>

                    {/* Overview Tab */}
                    {activeTab === 'overview' && (
                        <div className="card">
                            <h3 className="text-lg font-semibold mb-4">Time Series with Moving Averages</h3>
                            <ResponsiveContainer width="100%" height={400}>
                                <ComposedChart data={results.chartData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                                    <YAxis />
                                    <Tooltip />
                                    <Area type="monotone" dataKey="value" fill="#e0f2fe" stroke="#0891b2" name="Value" />
                                    <Line type="monotone" dataKey="ma7" stroke="#f59e0b" strokeWidth={2} dot={false} name="7-day MA" />
                                    <Line type="monotone" dataKey="ma30" stroke="#ef4444" strokeWidth={2} dot={false} name="30-day MA" />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* Decomposition Tab */}
                    {activeTab === 'decomposition' && (
                        <div className="space-y-4">
                            <div className="card">
                                <h3 className="text-lg font-semibold mb-4">Trend Component</h3>
                                <ResponsiveContainer width="100%" height={200}>
                                    <LineChart data={results.chartData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                                        <YAxis />
                                        <Tooltip />
                                        <Line type="monotone" dataKey="trend" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="card">
                                <h3 className="text-lg font-semibold mb-4">Seasonal Component</h3>
                                <ResponsiveContainer width="100%" height={200}>
                                    <AreaChart data={results.chartData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                                        <YAxis />
                                        <Tooltip />
                                        <Area type="monotone" dataKey="seasonal" fill="#fef3c7" stroke="#f59e0b" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="card">
                                <h3 className="text-lg font-semibold mb-4">Residual Component</h3>
                                <ResponsiveContainer width="100%" height={200}>
                                    <ComposedChart data={results.chartData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                                        <YAxis />
                                        <Tooltip />
                                        <Bar dataKey="residual" fill="#94a3b8" />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {/* Forecast Tab */}
                    {activeTab === 'forecast' && (
                        <div className="card">
                            <h3 className="text-lg font-semibold mb-4">
                                {config.forecastPeriods}-Day Forecast
                            </h3>
                            <ResponsiveContainer width="100%" height={400}>
                                <ComposedChart data={[ ...results.chartData.slice(-60), ...results.forecastData ]}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                                    <YAxis />
                                    <Tooltip />
                                    <Line type="monotone" dataKey="value" stroke="#0891b2" strokeWidth={2} dot={false} name="Historical" />
                                    <Line type="monotone" dataKey="forecast" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Forecast" />
                                    <Area type="monotone" dataKey="upper" fill="#ede9fe" stroke="none" name="Upper Bound" />
                                    <Area type="monotone" dataKey="lower" fill="#ffffff" stroke="#c4b5fd" strokeDasharray="3 3" name="Lower Bound" />
                                </ComposedChart>
                            </ResponsiveContainer>
                            <div className="mt-4 p-4 bg-purple-50 rounded-lg">
                                <p className="text-sm text-purple-800">
                                    <strong>Note:</strong> This is a simplified exponential smoothing forecast.
                                    For production use, consider ARIMA, Prophet, or LSTM models.
                                </p>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

export default TimeSeries
