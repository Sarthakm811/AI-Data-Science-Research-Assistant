import React, { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { BarChart3, TrendingUp, CheckCircle, AlertCircle, PieChart } from 'lucide-react'

const TABS = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'statistical', label: 'Statistics', icon: TrendingUp },
    { id: 'correlation', label: 'Correlations', icon: TrendingUp },
    { id: 'quality', label: 'Quality', icon: CheckCircle },
    { id: 'distribution', label: 'Distribution', icon: PieChart },
]

function StatBadge({ label, value, color = 'blue' }) {
    const colors = {
        blue: 'bg-blue-50 border-blue-200 text-blue-900',
        green: 'bg-green-50 border-green-200 text-green-900',
        purple: 'bg-purple-50 border-purple-200 text-purple-900',
    }
    return (
        <div className={`rounded-2xl border p-5 ${colors[ color ]}`}>
            <p className="text-sm font-medium opacity-70">{label}</p>
            <p className="mt-1 text-3xl font-bold">{value}</p>
        </div>
    )
}

function EDAResults({ results }) {
    const [ activeTab, setActiveTab ] = useState('overview')

    if (!results) {
        return (
            <div className="card border-l-4 border-yellow-400 bg-yellow-50">
                <div className="flex items-center gap-2 text-yellow-800">
                    <AlertCircle size={18} />
                    <p className="font-medium">No analysis results available</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Tabs */}
            <div className="flex gap-1 overflow-x-auto pb-1">
                {TABS.map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        onClick={() => setActiveTab(id)}
                        className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${activeTab === id
                                ? 'bg-slate-900 text-white shadow-md'
                                : 'text-slate-600 hover:bg-white hover:text-slate-900'
                            }`}
                    >
                        <Icon size={15} />
                        {label}
                    </button>
                ))}
            </div>

            {activeTab === 'overview' && (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <StatBadge label="Total Rows" value={(results.rowCount ?? 0).toLocaleString()} color="blue" />
                        <StatBadge label="Total Columns" value={results.columnCount ?? 0} color="green" />
                        <StatBadge label="Missing Values" value={results.missingCount ?? 0} color="purple" />
                    </div>
                    {results.columnTypes?.length > 0 && (
                        <div className="card">
                            <h3 className="section-title mb-4">Column Types</h3>
                            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                {results.columnTypes.map((col, idx) => (
                                    <div key={idx} className="rounded-xl bg-slate-50 p-3 text-center">
                                        <p className="truncate text-sm font-semibold text-slate-700">{col.name}</p>
                                        <p className="mt-1 text-xs capitalize text-slate-500">{col.type}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'statistical' && results.statistics && (
                <div className="card overflow-x-auto">
                    <h3 className="section-title mb-4">Descriptive Statistics</h3>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50">
                                {[ 'Column', 'Mean', 'Std Dev', 'Min', 'Max' ].map(h => (
                                    <th key={h} className={`border-b px-4 py-3 font-semibold text-slate-700 ${h === 'Column' ? 'text-left' : 'text-right'}`}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(results.statistics).map(([ col, s ]) => (
                                <tr key={col} className="border-b hover:bg-slate-50">
                                    <td className="px-4 py-2.5 font-medium text-slate-800">{col}</td>
                                    {[ 'mean', 'std', 'min', 'max' ].map(k => (
                                        <td key={k} className="px-4 py-2.5 text-right text-slate-600">
                                            {typeof s[ k ] === 'number' ? s[ k ].toFixed(2) : '—'}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'correlation' && results.correlation && (
                <div className="card">
                    <h3 className="section-title mb-4">Top Correlations</h3>
                    <div className="space-y-2">
                        {results.correlation.slice(0, 10).map((corr, idx) => (
                            <div key={idx} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                                <span className="flex-1 text-sm font-medium text-slate-800 truncate">
                                    {corr.variable1} ↔ {corr.variable2}
                                </span>
                                <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-200">
                                    <div
                                        className="h-full rounded-full bg-indigo-500"
                                        style={{ width: `${Math.abs(corr.value) * 100}%` }}
                                    />
                                </div>
                                <span className="w-14 text-right text-sm font-semibold text-slate-700">
                                    {corr.value.toFixed(3)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'quality' && results.dataQuality && (
                <div className="card">
                    <h3 className="section-title mb-4">Data Quality Report</h3>
                    <div className="space-y-2">
                        {[
                            { label: 'Completeness', value: `${(results.dataQuality.completeness * 100).toFixed(1)}%`, ok: results.dataQuality.completeness > 0.9 },
                            { label: 'Missing Values', value: results.dataQuality.missingCount, ok: results.dataQuality.missingCount === 0 },
                            { label: 'Duplicates', value: results.dataQuality.duplicateCount, ok: results.dataQuality.duplicateCount === 0 },
                        ].map(({ label, value, ok }) => (
                            <div key={label} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                                <span className="text-sm font-medium text-slate-700">{label}</span>
                                <span className={`text-sm font-semibold ${ok ? 'text-green-600' : 'text-orange-600'}`}>{value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'distribution' && results.distributions?.length > 0 && (
                <div className="card">
                    <h3 className="section-title mb-4">Value Distributions</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={results.distributions.slice(0, 5)}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                            <YAxis tick={{ fontSize: 12 }} />
                            <Tooltip />
                            <Bar dataKey="count" fill="#6366f1" radius={[ 4, 4, 0, 0 ]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    )
}

export default EDAResults
