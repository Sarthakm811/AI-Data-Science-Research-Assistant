import React from 'react'
import { Link } from 'react-router-dom'
import { Search, Sparkles, SlidersHorizontal, BarChart3, Brain, Calculator, MessageSquare, FileText, Database } from 'lucide-react'
import { useAnalysis } from '../context/AnalysisContext'

const features = [
    {
        icon: Search,
        title: 'Dataset Search',
        description: 'Search and download datasets from Kaggle',
        path: '/search',
        color: 'bg-blue-500'
    },
    {
        icon: Sparkles,
        title: 'Data Cleaning',
        description: 'Clean missing values, duplicates, and outliers before analysis',
        path: '/cleaning',
        color: 'bg-teal-600'
    },
    {
        icon: SlidersHorizontal,
        title: 'Feature Engineering',
        description: 'Create, encode, scale, and reduce features for better models',
        path: '/features',
        color: 'bg-indigo-600'
    },
    {
        icon: BarChart3,
        title: 'Auto EDA',
        description: 'Automated exploratory data analysis with visualizations',
        path: '/eda',
        color: 'bg-green-500'
    },
    {
        icon: Brain,
        title: 'Auto ML',
        description: 'Train and compare 35+ machine learning models',
        path: '/ml',
        color: 'bg-purple-500'
    },
    {
        icon: Calculator,
        title: 'Statistics and Math',
        description: 'Run probability, hypothesis tests, Bayesian analysis, time series, and linear algebra',
        path: '/statistics',
        color: 'bg-cyan-700'
    },
    {
        icon: MessageSquare,
        title: 'AI Chat',
        description: 'Ask questions about your data and get AI insights',
        path: '/chat',
        color: 'bg-pink-500'
    },
    {
        icon: FileText,
        title: 'Reports',
        description: 'Generate professional PDF and markdown reports',
        path: '/reports',
        color: 'bg-orange-500'
    }
]

function Dashboard({ dataset }) {
    const { edaResults, mlResults } = useAnalysis()
    const analysesRun = (edaResults ? 1 : 0) + (mlResults ? 1 : 0)
    return (
        <div className="space-y-8">
            {/* Hero Section */}
            <div className="card hero-contrast overflow-hidden bg-gradient-to-r from-teal-700 via-blue-800 to-orange-600 text-white">
                <div className="relative z-10">
                    <h1 className="title-display mb-2 text-3xl font-bold">Welcome to AI Data Science Assistant</h1>
                    <p className="mb-4 text-cyan-100">Build models, inspect quality, and generate insights faster</p>
                </div>

                {dataset ? (
                    <div className="inline-block rounded-xl border border-white/25 bg-white/15 p-4 backdrop-blur-sm">
                        <div className="flex items-center gap-3">
                            <Database size={24} />
                            <div>
                                <p className="font-semibold">{dataset.name}</p>
                                <p className="text-sm text-cyan-100">{dataset.rowCount} rows x {dataset.colCount} columns</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <p className="text-cyan-100">Upload a dataset to get started</p>
                )}
            </div>

            {/* Stats */}
            {dataset && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="card text-center">
                        <p className="text-3xl font-bold text-teal-700">{dataset.rowCount}</p>
                        <p className="text-slate-500">Rows</p>
                    </div>
                    <div className="card text-center">
                        <p className="text-3xl font-bold text-blue-700">{dataset.colCount}</p>
                        <p className="text-slate-500">Columns</p>
                    </div>
                    <div className="card text-center">
                        <p className="text-3xl font-bold text-emerald-700">{analysesRun}</p>
                        <p className="text-slate-500">Analyses Run</p>
                    </div>
                    <div className="card text-center">
                        <p className="text-3xl font-bold text-orange-600">{mlResults?.models?.length ?? 0}</p>
                        <p className="text-slate-500">Models Trained</p>
                    </div>
                </div>
            )}

            {/* Features Grid */}
            <div>
                <h2 className="title-display mb-4 text-xl font-semibold text-slate-900">Features</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {features.map((feature) => {
                        const Icon = feature.icon
                        return (
                            <Link key={feature.path} to={feature.path}>
                                <div className="card cursor-pointer hover:-translate-y-1">
                                    <div className={`${feature.color} w-12 h-12 rounded-lg flex items-center justify-center mb-4`}>
                                        <Icon size={24} className="text-white" />
                                    </div>
                                    <h3 className="mb-2 text-lg font-semibold text-slate-800">{feature.title}</h3>
                                    <p className="text-sm text-slate-500">{feature.description}</p>
                                </div>
                            </Link>
                        )
                    })}
                </div>
            </div>

            {/* Data Preview */}
            {dataset && (
                <div className="card">
                    <h2 className="title-display mb-4 text-xl font-semibold text-slate-900">Data Preview</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50">
                                    {dataset.headers.map((header, i) => (
                                        <th key={i} className="border-b px-4 py-3 text-left font-semibold text-slate-700">
                                            {header}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {dataset.rows.slice(0, 5).map((row, i) => (
                                    <tr key={i} className="hover:bg-slate-50">
                                        {dataset.headers.map((header, j) => (
                                            <td key={j} className="border-b px-4 py-3 text-slate-600">
                                                {row[ header ]}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}

export default Dashboard
