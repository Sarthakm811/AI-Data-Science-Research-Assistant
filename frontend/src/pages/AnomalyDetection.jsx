import React, { useState } from 'react'
import { AlertTriangle, Play, Settings, Eye, BarChart3 } from 'lucide-react'
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useAnalysis } from '../context/AnalysisContext'

function AnomalyDetection({ dataset }) {
    const [ analyzing, setAnalyzing ] = useState(false)
    const [ results, setResults ] = useState(null)
    const [ config, setConfig ] = useState({
        method: 'isolation_forest',
        contamination: 0.1,
        threshold: 3
    })
    const [ selectedColumns, setSelectedColumns ] = useState({ x: '', y: '' })
    const { setAnomalyResults } = useAnalysis()

    const runDetection = () => {
        if (!dataset) return
        setAnalyzing(true)

        setTimeout(() => {
            const numericCols = dataset.headers.filter(h => {
                const val = dataset.rows[ 0 ]?.[ h ]
                return !isNaN(parseFloat(val))
            })

            // Simulate anomaly detection
            const anomalyData = dataset.rows.map((row, idx) => {
                const values = numericCols.map(col => parseFloat(row[ col ]) || 0)
                const mean = values.reduce((a, b) => a + b, 0) / values.length
                const std = Math.sqrt(values.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / values.length)

                // Z-score based anomaly detection
                const zScores = values.map(v => Math.abs((v - mean) / (std || 1)))
                const maxZScore = Math.max(...zScores)
                const isAnomaly = config.method === 'zscore'
                    ? maxZScore > config.threshold
                    : Math.random() < config.contamination

                return {
                    index: idx,
                    ...row,
                    isAnomaly,
                    anomalyScore: maxZScore,
                    values
                }
            })

            const anomalies = anomalyData.filter(d => d.isAnomaly)
            const normal = anomalyData.filter(d => !d.isAnomaly)

            // Column statistics for anomalies
            const columnStats = numericCols.map(col => {
                const normalValues = normal.map(r => parseFloat(r[ col ]) || 0)
                const anomalyValues = anomalies.map(r => parseFloat(r[ col ]) || 0)

                const normalMean = normalValues.reduce((a, b) => a + b, 0) / normalValues.length || 0
                const anomalyMean = anomalyValues.reduce((a, b) => a + b, 0) / anomalyValues.length || 0

                return {
                    column: col,
                    normalMean: normalMean.toFixed(2),
                    anomalyMean: anomalyMean.toFixed(2),
                    difference: Math.abs(anomalyMean - normalMean).toFixed(2)
                }
            })

            const anomalyResultsData = {
                totalRows: dataset.rowCount,
                anomalyCount: anomalies.length,
                normalCount: normal.length,
                anomalyPercentage: ((anomalies.length / dataset.rowCount) * 100).toFixed(2),
                data: anomalyData,
                anomalies,
                normal,
                columnStats,
                numericCols,
                method: config.method
            }
            setResults(anomalyResultsData)
            setAnomalyResults(anomalyResultsData) // Save to global context for reports

            if (numericCols.length >= 2) {
                setSelectedColumns({ x: numericCols[ 0 ], y: numericCols[ 1 ] })
            }

            setAnalyzing(false)
        }, 1500)
    }

    if (!dataset) {
        return (
            <div className="card text-center py-16">
                <AlertTriangle size={64} className="mx-auto text-gray-300 mb-4" />
                <h2 className="text-2xl font-bold text-gray-800 mb-2">No Dataset Loaded</h2>
                <p className="text-gray-500">Upload a CSV file to detect anomalies</p>
            </div>
        )
    }

    const scatterData = results?.data?.slice(0, 500).map(d => ({
        x: parseFloat(d[ selectedColumns.x ]) || 0,
        y: parseFloat(d[ selectedColumns.y ]) || 0,
        isAnomaly: d.isAnomaly,
        index: d.index
    })) || []

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="card bg-gradient-to-r from-rose-700 via-orange-700 to-amber-600 text-white">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="title-display mb-1 text-2xl font-bold">Anomaly Detection</h1>
                        <p className="text-rose-100">Identify outliers and unusual patterns in your data</p>
                    </div>
                    <button
                        onClick={runDetection}
                        disabled={analyzing}
                        className="rounded-xl bg-white px-6 py-3 font-semibold text-rose-700 transition hover:bg-rose-50 flex items-center gap-2"
                    >
                        <Play size={18} />
                        {analyzing ? 'Detecting...' : 'Run Detection'}
                    </button>
                </div>
            </div>

            {/* Configuration */}
            <div className="card">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Settings size={20} /> Detection Settings
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Method</label>
                        <select
                            value={config.method}
                            onChange={(e) => setConfig({ ...config, method: e.target.value })}
                            className="input-field"
                        >
                            <option value="isolation_forest">Isolation Forest</option>
                            <option value="zscore">Z-Score</option>
                            <option value="iqr">IQR Method</option>
                            <option value="dbscan">DBSCAN Clustering</option>
                        </select>
                    </div>
                    {config.method === 'isolation_forest' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Contamination: {(config.contamination * 100).toFixed(0)}%
                            </label>
                            <input
                                type="range"
                                min="0.01"
                                max="0.5"
                                step="0.01"
                                value={config.contamination}
                                onChange={(e) => setConfig({ ...config, contamination: parseFloat(e.target.value) })}
                                className="w-full"
                            />
                        </div>
                    )}
                    {config.method === 'zscore' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Z-Score Threshold: {config.threshold}
                            </label>
                            <input
                                type="range"
                                min="1"
                                max="5"
                                step="0.5"
                                value={config.threshold}
                                onChange={(e) => setConfig({ ...config, threshold: parseFloat(e.target.value) })}
                                className="w-full"
                            />
                        </div>
                    )}
                </div>
            </div>

            {results && (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="card text-center">
                            <p className="text-3xl font-bold text-slate-800">{results.totalRows}</p>
                            <p className="text-slate-500">Total Records</p>
                        </div>
                        <div className="card text-center bg-red-50 border-red-200">
                            <p className="text-3xl font-bold text-red-600">{results.anomalyCount}</p>
                            <p className="text-red-500">Anomalies Detected</p>
                        </div>
                        <div className="card text-center bg-green-50 border-green-200">
                            <p className="text-3xl font-bold text-green-600">{results.normalCount}</p>
                            <p className="text-green-500">Normal Records</p>
                        </div>
                        <div className="card text-center">
                            <p className="text-3xl font-bold text-orange-600">{results.anomalyPercentage}%</p>
                            <p className="text-slate-500">Anomaly Rate</p>
                        </div>
                    </div>

                    {/* Scatter Plot */}
                    <div className="card">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                <Eye size={20} /> Anomaly Visualization
                            </h3>
                            <div className="flex gap-4">
                                <select
                                    value={selectedColumns.x}
                                    onChange={(e) => setSelectedColumns({ ...selectedColumns, x: e.target.value })}
                                    className="rounded-lg border border-slate-300 px-3 py-1 text-sm"
                                >
                                    {results.numericCols.map(col => (
                                        <option key={col} value={col}>{col}</option>
                                    ))}
                                </select>
                                <span className="text-gray-500">vs</span>
                                <select
                                    value={selectedColumns.y}
                                    onChange={(e) => setSelectedColumns({ ...selectedColumns, y: e.target.value })}
                                    className="rounded-lg border border-slate-300 px-3 py-1 text-sm"
                                >
                                    {results.numericCols.map(col => (
                                        <option key={col} value={col}>{col}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <ResponsiveContainer width="100%" height={400}>
                            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="x" name={selectedColumns.x} />
                                <YAxis dataKey="y" name={selectedColumns.y} />
                                <Tooltip
                                    content={({ payload }) => {
                                        if (payload && payload[ 0 ]) {
                                            const data = payload[ 0 ].payload
                                            return (
                                                <div className="bg-white p-2 border rounded shadow">
                                                    <p className={`font-semibold ${data.isAnomaly ? 'text-red-600' : 'text-green-600'}`}>
                                                        {data.isAnomaly ? '⚠️ Anomaly' : '✓ Normal'}
                                                    </p>
                                                    <p className="text-sm">{selectedColumns.x}: {data.x.toFixed(2)}</p>
                                                    <p className="text-sm">{selectedColumns.y}: {data.y.toFixed(2)}</p>
                                                </div>
                                            )
                                        }
                                        return null
                                    }}
                                />
                                <Scatter data={scatterData} fill="#8884d8">
                                    {scatterData.map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={entry.isAnomaly ? '#ef4444' : '#22c55e'}
                                            r={entry.isAnomaly ? 8 : 4}
                                        />
                                    ))}
                                </Scatter>
                            </ScatterChart>
                        </ResponsiveContainer>
                        <div className="flex justify-center gap-6 mt-4">
                            <span className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-green-500"></span> Normal
                            </span>
                            <span className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-red-500"></span> Anomaly
                            </span>
                        </div>
                    </div>

                    {/* Column Statistics */}
                    <div className="card">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <BarChart3 size={20} /> Column Statistics
                        </h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50">
                                        <th className="px-4 py-2 text-left">Column</th>
                                        <th className="px-4 py-2 text-left">Normal Mean</th>
                                        <th className="px-4 py-2 text-left">Anomaly Mean</th>
                                        <th className="px-4 py-2 text-left">Difference</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.columnStats.map((stat, i) => (
                                        <tr key={i} className="border-b hover:bg-slate-50">
                                            <td className="px-4 py-2 font-medium">{stat.column}</td>
                                            <td className="px-4 py-2 text-green-600">{stat.normalMean}</td>
                                            <td className="px-4 py-2 text-red-600">{stat.anomalyMean}</td>
                                            <td className="px-4 py-2">
                                                <span className={`px-2 py-1 rounded text-xs ${parseFloat(stat.difference) > 1 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                                                    }`}>
                                                    {stat.difference}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Anomaly Records */}
                    {results.anomalies.length > 0 && (
                        <div className="card">
                            <h3 className="text-lg font-semibold mb-4 text-red-600">
                                ⚠️ Detected Anomalies ({results.anomalies.length})
                            </h3>
                            <div className="overflow-x-auto max-h-64">
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 bg-white">
                                        <tr className="bg-red-50">
                                            <th className="px-3 py-2 text-left">Row</th>
                                            {dataset.headers.slice(0, 6).map((h, i) => (
                                                <th key={i} className="px-3 py-2 text-left">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {results.anomalies.slice(0, 20).map((row, i) => (
                                            <tr key={i} className="border-b hover:bg-red-50">
                                                <td className="px-3 py-2 font-medium">{row.index + 1}</td>
                                                {dataset.headers.slice(0, 6).map((h, j) => (
                                                    <td key={j} className="px-3 py-2">{row[ h ]}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

export default AnomalyDetection
