import React, { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, Cell } from 'recharts'
import { CheckCircle, ChevronDown, Trophy, Zap, Clock } from 'lucide-react'

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

const CATEGORY_COLORS = {
    'Boosting': 'bg-purple-100 text-purple-700',
    'Ensemble': 'bg-blue-100 text-blue-700',
    'Linear': 'bg-green-100 text-green-700',
    'SVM': 'bg-orange-100 text-orange-700',
    'Neural Network': 'bg-pink-100 text-pink-700',
    'Deep Learning': 'bg-rose-100 text-rose-700',
    'Tree': 'bg-yellow-100 text-yellow-700',
    'Distance': 'bg-cyan-100 text-cyan-700',
    'Probabilistic': 'bg-indigo-100 text-indigo-700',
    'Discriminant': 'bg-teal-100 text-teal-700',
    'Gaussian Process': 'bg-violet-100 text-violet-700',
    'Robust': 'bg-amber-100 text-amber-700',
    'Polynomial': 'bg-lime-100 text-lime-700',
    'Kernel': 'bg-fuchsia-100 text-fuchsia-700',
    'GLM': 'bg-emerald-100 text-emerald-700'
}

const BUSINESS_METRIC_LABELS = {
    accuracy: 'Accuracy',
    precision: 'Precision',
    recall: 'Recall',
    f1: 'F1 Score',
    roc_auc: 'ROC-AUC',
    r2: 'R² Score',
    mae: 'MAE',
    mse: 'MSE',
    rmse: 'RMSE',
    silhouette: 'Silhouette Score',
    inertia: 'Inertia'
}

function getMetricValue(metricKey, metrics, bestModel) {
    const bestValue = bestModel?.[ metricKey ]
    if (bestValue != null && Number.isFinite(Number(bestValue))) {
        return Number(bestValue)
    }

    const metricsValue = metrics?.[ metricKey ]
    if (metricsValue != null && Number.isFinite(Number(metricsValue))) {
        return Number(metricsValue)
    }

    return null
}

function getModelMetricValue(metricKey, model) {
    const value = model?.[ metricKey ]
    if (value != null && Number.isFinite(Number(value))) {
        return Number(value)
    }
    return null
}

function MLResults({ results, onApplyClusterToDataset }) {
    const [ expandedModel, setExpandedModel ] = useState(null)
    const [ viewMode, setViewMode ] = useState('all')
    const [ downloadFormat, setDownloadFormat ] = useState('pkl')
    const [ downloadingModel, setDownloadingModel ] = useState(false)
    const [ downloadError, setDownloadError ] = useState(null)

    if (!results || !results.models) {
        return (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                <p className="text-yellow-800">No model results available</p>
            </div>
        )
    }

    const taskTypeText = String(results.taskType || results.task_type || '').toLowerCase()
    const isClassification = taskTypeText.includes('classification')
    const isRegression = taskTypeText.includes('regression')
    const isClustering = taskTypeText.includes('clustering')
    const primaryMetric = isClassification ? 'accuracy' : isClustering ? 'silhouette' : 'r2'

    const bestModel = results.models.reduce((best, current) =>
        (current[ primaryMetric ] || 0) > (best[ primaryMetric ] || 0) ? current : best,
        results.models[ 0 ]
    )

    // Get unique categories
    const categories = [ ...new Set(results.models.map(m => m.category).filter(Boolean)) ]

    // Filter models by category
    const filteredModels = viewMode === 'all'
        ? results.models
        : results.models.filter(m => m.category === viewMode)

    const metrics = results.metrics || {}
    const confusion = results.confusion_matrix || {}
    const hasConfusionMatrix = Array.isArray(confusion.matrix) && confusion.matrix.length > 0
    const rocCurve = metrics.roc_curve || bestModel?.roc_curve || null
    const rocCurveData = Array.isArray(rocCurve?.fpr) && Array.isArray(rocCurve?.tpr)
        ? rocCurve.fpr.map((fpr, idx) => ({
            fpr: Number(fpr),
            tpr: Number(rocCurve.tpr[ idx ] ?? 0),
            baseline: Number(fpr)
        }))
        : []

    const biasLevel = metrics.bias_level || bestModel?.bias_level
    const varianceLevel = metrics.variance_level || bestModel?.variance_level
    const biasProxy = metrics.bias_proxy ?? bestModel?.bias_proxy
    const varianceProxy = metrics.variance_proxy ?? bestModel?.variance_proxy

    const businessContext = results.business_context || {}
    const businessMetricKey = businessContext.metric
    const businessTarget = businessContext.target
    const businessDirection = businessContext.direction || '>='
    const businessMetricValue = businessMetricKey ? getMetricValue(businessMetricKey, metrics, bestModel) : null
    const businessTargetNumber = businessTarget != null ? Number(businessTarget) : null
    const hasBusinessAlignment = businessMetricKey && businessMetricValue != null && businessTargetNumber != null
    const businessPass = hasBusinessAlignment
        ? (businessDirection === '<=' ? businessMetricValue <= businessTargetNumber : businessMetricValue >= businessTargetNumber)
        : false

    const modelMeetsBusinessTarget = (model) => {
        if (!hasBusinessAlignment || !businessMetricKey) {
            return null
        }

        const value = getModelMetricValue(businessMetricKey, model)
        if (value == null) {
            return null
        }

        return businessDirection === '<=' ? value <= businessTargetNumber : value >= businessTargetNumber
    }

    const alignmentRecommendation = (() => {
        if (!hasBusinessAlignment || businessPass) {
            return null
        }

        if (isClassification) {
            if (varianceLevel === 'High') {
                return 'Recommendation: reduce overfitting by simplifying the model, increasing regularization, and enabling stronger cross-validation.'
            }
            if (biasLevel === 'High') {
                return 'Recommendation: reduce underfitting by adding richer features, trying more expressive models, and tuning hyperparameters.'
            }
            return 'Recommendation: optimize classification threshold and run hyperparameter tuning to improve precision/recall trade-offs.'
        }

        if (isRegression) {
            if (varianceLevel === 'High') {
                return 'Recommendation: stabilize generalization with regularization, feature pruning, and more robust CV folds.'
            }
            if (biasLevel === 'High') {
                return 'Recommendation: improve fit quality with nonlinear features or stronger models, then retune with Grid/Random search.'
            }
            return 'Recommendation: tune model depth/penalties and refine feature engineering to close the target gap.'
        }

        if (isClustering) {
            return 'Recommendation: re-run clustering with different cluster counts and scaling, then compare silhouette and inertia together.'
        }

        return 'Recommendation: rerun training with tuning enabled and evaluate model stability using cross-validation metrics.'
    })()

    const downloadTrainedModel = async () => {
        if (!results?.model_id) return

        setDownloadingModel(true)
        try {
            const response = await fetch(`${API_BASE_URL}/api/ml/models/${results.model_id}/download?format=${encodeURIComponent(downloadFormat)}`)
            if (!response.ok) {
                const errorPayload = await response.json().catch(() => ({}))
                throw new Error(errorPayload?.detail || 'Failed to download model')
            }

            const blob = await response.blob()
            const contentDisposition = response.headers.get('content-disposition') || ''
            const match = contentDisposition.match(/filename="?([^\"]+)"?/i)
            const fallbackName = `trained-model-${results.model_id}.${downloadFormat === 'pickle' ? 'pkl' : downloadFormat}`
            const filename = match?.[ 1 ] || fallbackName

            const url = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = filename
            document.body.appendChild(link)
            link.click()
            link.remove()
            window.URL.revokeObjectURL(url)
        } catch (err) {
            setDownloadError(err?.message || 'Download failed')
        } finally {
            setDownloadingModel(false)
        }
    }

    return (
        <div className="space-y-6">
            {/* Selected model summary for dynamic AutoML flow */}
            {(results.selectedModel || results.model_name || results.selectedX || results.selectedY) && (
                <div className="card space-y-3">
                    <h3 className="text-lg font-semibold text-gray-900">Selected Model Training Summary</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div><span className="font-semibold">Model:</span> {results.selectedModel || results.model_name || 'N/A'}</div>
                        <div><span className="font-semibold">Task:</span> {results.taskType || results.task_type || 'N/A'}</div>
                        <div><span className="font-semibold">X Features:</span> {(results.selectedX || results.x_columns || []).join(', ') || 'N/A'}</div>
                        <div><span className="font-semibold">Y Targets:</span> {(results.selectedY || results.y_columns || []).join(', ') || 'N/A'}</div>
                        <div><span className="font-semibold">Total Rows Used:</span> {results.total_rows ?? 'N/A'}</div>
                        <div><span className="font-semibold">Train/Test Split:</span> {results.train_rows != null && results.test_rows != null ? `${results.train_rows} / ${results.test_rows}` : 'N/A'}</div>
                        <div><span className="font-semibold">Feature Count (encoded):</span> {results.feature_count ?? 'N/A'}</div>
                        <div><span className="font-semibold">Training Time:</span> {results.trainingTime != null ? `${Number(results.trainingTime).toFixed(3)}s` : (results.training_time != null ? `${Number(results.training_time).toFixed(3)}s` : 'N/A')}</div>
                    </div>

                    {(isClassification || isRegression) && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                            {isClassification && (
                                <>
                                    <MetricCard label="Accuracy" value={metrics.accuracy != null ? `${(metrics.accuracy * 100).toFixed(2)}%` : 'N/A'} />
                                    <MetricCard label="Precision" value={metrics.precision != null ? `${(metrics.precision * 100).toFixed(2)}%` : 'N/A'} />
                                    <MetricCard label="Recall" value={metrics.recall != null ? `${(metrics.recall * 100).toFixed(2)}%` : 'N/A'} />
                                    <MetricCard label="F1 Score" value={metrics.f1 != null ? `${(metrics.f1 * 100).toFixed(2)}%` : 'N/A'} />
                                </>
                            )}
                            {isRegression && (
                                <>
                                    <MetricCard label="R² Score" value={metrics.r2 != null ? Number(metrics.r2).toFixed(4) : 'N/A'} />
                                    <MetricCard label="MAE" value={metrics.mae != null ? Number(metrics.mae).toFixed(4) : 'N/A'} />
                                    <MetricCard label="MSE" value={metrics.mse != null ? Number(metrics.mse).toFixed(4) : 'N/A'} />
                                    <MetricCard label="RMSE" value={metrics.rmse != null ? Number(metrics.rmse).toFixed(4) : 'N/A'} />
                                </>
                            )}
                        </div>
                    )}

                    {isClassification && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                            <MetricCard label="ROC-AUC" value={metrics.roc_auc != null ? Number(metrics.roc_auc).toFixed(4) : 'N/A'} />
                            <MetricCard label="Bias Indicator" value={biasLevel || 'N/A'} />
                            <MetricCard label="Variance Indicator" value={varianceLevel || 'N/A'} />
                        </div>
                    )}

                    {isRegression && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                            <MetricCard label="Bias Indicator" value={biasLevel || 'N/A'} />
                            <MetricCard label="Variance Indicator" value={varianceLevel || 'N/A'} />
                            <MetricCard
                                label="Generalization Stability"
                                value={metrics.cv_std != null ? Number(metrics.cv_std).toFixed(4) : 'N/A'}
                            />
                        </div>
                    )}

                    {hasConfusionMatrix && (
                        <div className="pt-2">
                            <p className="text-sm font-semibold text-gray-900 mb-2">Confusion Matrix</p>
                            <div className="overflow-x-auto">
                                <table className="min-w-[420px] w-full border border-gray-200 text-sm">
                                    <thead>
                                        <tr>
                                            <th className="p-2 border bg-gray-50">Actual \ Predicted</th>
                                            {(confusion.labels || []).map((label, i) => (
                                                <th key={`cm-h-${i}`} className="p-2 border bg-gray-50">{label}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {confusion.matrix.map((row, rIdx) => (
                                            <tr key={`cm-r-${rIdx}`}>
                                                <td className="p-2 border font-medium bg-gray-50">{(confusion.labels || [])[ rIdx ] ?? rIdx}</td>
                                                {row.map((v, cIdx) => (
                                                    <td key={`cm-c-${rIdx}-${cIdx}`} className="p-2 border text-center">{v}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {isClassification && rocCurveData.length > 1 && (
                        <div className="pt-2">
                            <p className="text-sm font-semibold text-gray-900 mb-2">ROC Curve</p>
                            <div className="h-72 w-full rounded-lg border border-gray-200 bg-white p-3">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={rocCurveData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis type="number" dataKey="fpr" domain={[ 0, 1 ]} name="False Positive Rate" />
                                        <YAxis type="number" dataKey="tpr" domain={[ 0, 1 ]} name="True Positive Rate" />
                                        <Tooltip formatter={(v) => Number(v).toFixed(4)} />
                                        <Legend />
                                        <Line type="monotone" dataKey="baseline" stroke="#9ca3af" dot={false} strokeDasharray="5 5" name="Baseline" />
                                        <Line type="monotone" dataKey="tpr" stroke="#4f46e5" dot={false} strokeWidth={2} name="ROC" />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {isClustering && (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2">
                            <MetricCard label="Silhouette" value={metrics.silhouette != null ? Number(metrics.silhouette).toFixed(4) : 'N/A'} />
                            <MetricCard label="Inertia" value={metrics.inertia != null ? Number(metrics.inertia).toFixed(2) : 'N/A'} />
                            <MetricCard label="Calinski-Harabasz" value={metrics.calinski_harabasz != null ? Number(metrics.calinski_harabasz).toFixed(2) : 'N/A'} />
                            <MetricCard label="Davies-Bouldin" value={metrics.davies_bouldin != null ? Number(metrics.davies_bouldin).toFixed(4) : 'N/A'} />
                        </div>
                    )}
                </div>
            )}

            {(hasBusinessAlignment || biasLevel || varianceLevel) && (
                <div className="card space-y-3">
                    <h3 className="text-lg font-semibold text-gray-900">Model Evaluation Insights</h3>

                    {hasBusinessAlignment && (
                        <div className={`rounded-lg border p-3 ${businessPass ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                            <p className="text-sm font-semibold text-gray-900">
                                Business Goal: {BUSINESS_METRIC_LABELS[ businessMetricKey ] || businessMetricKey} {businessDirection} {businessTargetNumber}
                            </p>
                            <p className="text-sm mt-1 text-gray-700">
                                Current best value: {businessMetricValue != null ? Number(businessMetricValue).toFixed(4) : 'N/A'}
                            </p>
                            <p className={`text-sm mt-1 font-medium ${businessPass ? 'text-emerald-700' : 'text-amber-700'}`}>
                                {businessPass
                                    ? 'Aligned: current model performance meets the business threshold.'
                                    : 'Not aligned yet: adjust model strategy or thresholds to meet business target.'}
                            </p>
                            {!businessPass && alignmentRecommendation && (
                                <p className="text-sm mt-2 text-amber-800">
                                    {alignmentRecommendation}
                                </p>
                            )}
                        </div>
                    )}

                    {(biasLevel || varianceLevel) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <p className="text-xs uppercase tracking-wide text-slate-500">Bias</p>
                                <p className="text-base font-semibold text-slate-900">{biasLevel || 'N/A'}</p>
                                <p className="text-xs text-slate-600 mt-1">Proxy: {biasProxy != null ? Number(biasProxy).toFixed(4) : 'N/A'}</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <p className="text-xs uppercase tracking-wide text-slate-500">Variance</p>
                                <p className="text-base font-semibold text-slate-900">{varianceLevel || 'N/A'}</p>
                                <p className="text-xs text-slate-600 mt-1">Proxy: {varianceProxy != null ? Number(varianceProxy).toFixed(4) : 'N/A'}</p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {isClustering && results.cluster_preview?.rows?.length > 0 && (
                <div className="card">
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <h3 className="text-lg font-semibold text-gray-900">Cluster Preview</h3>
                        {typeof onApplyClusterToDataset === 'function' && (
                            <button
                                type="button"
                                onClick={onApplyClusterToDataset}
                                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                            >
                                Apply Cluster Labels To Dataset
                            </button>
                        )}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50">
                                    {(results.cluster_preview.headers || []).slice(0, 10).map((h, idx) => (
                                        <th key={`cluster-h-${idx}`} className="border-b px-3 py-2 text-left font-semibold text-slate-700">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {results.cluster_preview.rows.slice(0, 8).map((row, rIdx) => (
                                    <tr key={`cluster-r-${rIdx}`} className="hover:bg-slate-50">
                                        {(results.cluster_preview.headers || []).slice(0, 10).map((h, cIdx) => (
                                            <td key={`cluster-c-${rIdx}-${cIdx}`} className="border-b px-3 py-2 text-slate-600">{String(row[ h ] ?? '')}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">Showing up to 8 rows and first 10 columns including assigned cluster labels.</p>
                </div>
            )}

            {results.model_id && (
                <div className="space-y-2">
                    <div className="card flex flex-col md:flex-row md:items-center gap-3">
                        <label className="text-sm text-gray-700 font-semibold">Download Trained Model:</label>
                        <select
                            value={downloadFormat}
                            onChange={(e) => setDownloadFormat(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                        >
                            <option value="pkl">Pickle (.pkl)</option>
                            <option value="joblib">Joblib (.joblib)</option>
                            <option value="json">Metadata (.json)</option>
                        </select>
                        <button
                            type="button"
                            onClick={downloadTrainedModel}
                            disabled={downloadingModel}
                            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-60"
                        >
                            {downloadingModel ? 'Downloading...' : 'Download Model'}
                        </button>
                        <span className="text-xs text-gray-500">Model ID: {results.model_id}</span>
                    </div>
                    {downloadError && (
                        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            <span>{downloadError}</span>
                            <button onClick={() => setDownloadError(null)} className="ml-auto text-red-400 hover:text-red-600 text-xs">✕</button>
                        </div>
                    )}
                </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl p-5 border border-blue-200">
                    <div className="flex items-center gap-2 mb-2">
                        <Zap size={18} className="text-blue-600" />
                        <p className="text-gray-600 text-sm font-medium">Models Trained</p>
                    </div>
                    <p className="text-3xl font-bold text-blue-900">{results.models.length}</p>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-2xl p-5 border border-green-200">
                    <div className="flex items-center gap-2 mb-2">
                        <Trophy size={18} className="text-green-600" />
                        <p className="text-gray-600 text-sm font-medium">{isClassification ? 'Best Accuracy' : isClustering ? 'Best Silhouette' : 'Best R² Score'}</p>
                    </div>
                    <p className="text-3xl font-bold text-green-900">
                        {isClassification
                            ? `${((bestModel.accuracy || metrics.accuracy || 0) * 100).toFixed(1)}%`
                            : isClustering
                                ? Number(bestModel.silhouette ?? metrics.silhouette ?? 0).toFixed(3)
                                : Number(bestModel.r2 ?? metrics.r2 ?? 0).toFixed(4)
                        }
                    </p>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl p-5 border border-purple-200">
                    <p className="text-gray-600 text-sm font-medium mb-2">Best Model</p>
                    <p className="text-xl font-bold text-purple-900">{bestModel.type}</p>
                    {bestModel.category && (
                        <span className={`text-xs px-2 py-0.5 rounded mt-1 inline-block ${CATEGORY_COLORS[ bestModel.category ] || 'bg-gray-100 text-gray-700'}`}>
                            {bestModel.category}
                        </span>
                    )}
                </div>
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-2xl p-5 border border-orange-200">
                    <div className="flex items-center gap-2 mb-2">
                        <Clock size={18} className="text-orange-600" />
                        <p className="text-gray-600 text-sm font-medium">Training Time</p>
                    </div>
                    <p className="text-3xl font-bold text-orange-900">
                        {results.trainingTime ? `${results.trainingTime.toFixed(1)}s` : 'N/A'}
                    </p>
                </div>
            </div>

            {/* Category Filter */}
            {
                categories.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setViewMode('all')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${viewMode === 'all'
                                ? 'bg-gray-900 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                        >
                            All Models ({results.models.length})
                        </button>
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setViewMode(cat)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${viewMode === cat
                                    ? 'bg-gray-900 text-white'
                                    : `${CATEGORY_COLORS[ cat ] || 'bg-gray-100 text-gray-700'} hover:opacity-80`
                                    }`}
                            >
                                {cat} ({results.models.filter(m => m.category === cat).length})
                            </button>
                        ))}
                    </div>
                )
            }

            {/* Model Comparison Chart */}
            <div className="card">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Model Comparison - Top 10 {isClassification ? 'by Accuracy' : isClustering ? 'by Silhouette' : 'by R² Score'}
                </h3>
                {hasBusinessAlignment && (
                    <p className="mb-3 text-xs text-slate-600">
                        Primary bars are color-banded by business target: green = meets target, amber = below target, indigo = target not applicable.
                    </p>
                )}
                <ResponsiveContainer width="100%" height={350}>
                    <BarChart
                        data={filteredModels.slice(0, 10).map(m => ({
                            name: m.type.length > 15 ? m.type.substring(0, 15) + '...' : m.type,
                            meetsBusinessTarget: modelMeetsBusinessTarget(m),
                            ...(isClassification ? {
                                Accuracy: ((m.accuracy || 0) * 100).toFixed(1),
                                Precision: ((m.precision || 0) * 100).toFixed(1),
                                Recall: ((m.recall || 0) * 100).toFixed(1),
                                F1: ((m.f1 || 0) * 100).toFixed(1)
                            } : isClustering ? {
                                Silhouette: (m.silhouette ?? 0).toFixed(3),
                                Calinski: (m.calinski_harabasz ?? 0).toFixed(1),
                                Davies: (m.davies_bouldin ?? 0).toFixed(3)
                            } : {
                                'R²': (m.r2 || 0).toFixed(3),
                                RMSE: (m.rmse || 0).toFixed(3),
                                MAE: (m.mae || 0).toFixed(3)
                            })
                        }))}
                        layout="vertical"
                        margin={{ left: 100 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" domain={isClassification ? [ 0, 100 ] : isClustering ? [ -1, 1 ] : [ 0, 1 ]} />
                        <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        {isClassification ? (
                            <>
                                <Bar dataKey="Accuracy">
                                    {filteredModels.slice(0, 10).map((model, index) => {
                                        const meets = modelMeetsBusinessTarget(model)
                                        const fill = meets == null ? '#4f46e5' : (meets ? '#16a34a' : '#d97706')
                                        return <Cell key={`acc-cell-${index}`} fill={fill} />
                                    })}
                                </Bar>
                                <Bar dataKey="F1" fill="#ec4899" />
                            </>
                        ) : isClustering ? (
                            <>
                                <Bar dataKey="Silhouette">
                                    {filteredModels.slice(0, 10).map((model, index) => {
                                        const meets = modelMeetsBusinessTarget(model)
                                        const fill = meets == null ? '#4f46e5' : (meets ? '#16a34a' : '#d97706')
                                        return <Cell key={`sil-cell-${index}`} fill={fill} />
                                    })}
                                </Bar>
                            </>
                        ) : (
                            <>
                                <Bar dataKey="R²">
                                    {filteredModels.slice(0, 10).map((model, index) => {
                                        const meets = modelMeetsBusinessTarget(model)
                                        const fill = meets == null ? '#4f46e5' : (meets ? '#16a34a' : '#d97706')
                                        return <Cell key={`r2-cell-${index}`} fill={fill} />
                                    })}
                                </Bar>
                            </>
                        )}
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Detailed Model Results */}
            <div className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-900">
                    Model Details ({filteredModels.length} models)
                </h3>
                {filteredModels.map((model, idx) => (
                    <div key={idx} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <button
                            onClick={() => setExpandedModel(expandedModel === idx ? null : idx)}
                            className="w-full px-5 py-4 hover:bg-gray-50 transition flex items-center justify-between"
                        >
                            <div className="flex items-center gap-4 flex-1">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white text-sm ${model === bestModel ? 'bg-gradient-to-br from-yellow-400 to-orange-500' : 'bg-gray-400'
                                    }`}>
                                    {model === bestModel ? <Trophy size={18} /> : idx + 1}
                                </div>
                                <div className="text-left">
                                    <div className="flex items-center gap-2">
                                        <p className="font-semibold text-gray-900">{model.type}</p>
                                        {model.category && (
                                            <span className={`text-xs px-2 py-0.5 rounded ${CATEGORY_COLORS[ model.category ] || 'bg-gray-100 text-gray-700'}`}>
                                                {model.category}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-500">
                                        {isClassification
                                            ? `Accuracy: ${(model.accuracy * 100).toFixed(2)}% | F1: ${(model.f1 * 100).toFixed(2)}%`
                                            : isClustering
                                                ? `Silhouette: ${(model.silhouette ?? 0).toFixed(3)} | Calinski: ${(model.calinski_harabasz ?? 0).toFixed(1)}`
                                                : `R²: ${model.r2?.toFixed(4)} | RMSE: ${model.rmse?.toFixed(4)} | MAE: ${model.mae?.toFixed(4)}`
                                        }
                                    </p>
                                    {!isClustering && (model.cv_mean != null || model.cv_std != null) && (
                                        <p className="text-xs text-slate-500">
                                            CV: {model.cv_mean != null ? Number(model.cv_mean).toFixed(4) : 'N/A'}
                                            {' '}±{' '}
                                            {model.cv_std != null ? Number(model.cv_std).toFixed(4) : 'N/A'}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {model === bestModel && <CheckCircle size={20} className="text-green-600" />}
                                <ChevronDown size={20} className={`text-gray-400 transition ${expandedModel === idx ? 'rotate-180' : ''}`} />
                            </div>
                        </button>

                        {expandedModel === idx && (
                            <div className="border-t border-gray-200 px-5 py-4 space-y-4 bg-gray-50">
                                <div>
                                    <p className="text-sm font-semibold text-gray-900 mb-3">Performance Metrics</p>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        {isClassification ? (
                                            <>
                                                <MetricCard label="Accuracy" value={`${(model.accuracy * 100).toFixed(2)}%`} />
                                                <MetricCard label="Precision" value={`${(model.precision * 100).toFixed(2)}%`} />
                                                <MetricCard label="Recall" value={`${(model.recall * 100).toFixed(2)}%`} />
                                                <MetricCard label="F1 Score" value={`${(model.f1 * 100).toFixed(2)}%`} />
                                            </>
                                        ) : isClustering ? (
                                            <>
                                                <MetricCard label="Silhouette" value={(model.silhouette ?? 0).toFixed(4)} />
                                                <MetricCard label="Inertia" value={model.inertia != null ? Number(model.inertia).toFixed(2) : 'N/A'} />
                                                <MetricCard label="Calinski-Harabasz" value={(model.calinski_harabasz ?? 0).toFixed(2)} />
                                                <MetricCard label="Davies-Bouldin" value={(model.davies_bouldin ?? 0).toFixed(4)} />
                                            </>
                                        ) : (
                                            <>
                                                <MetricCard label="R² Score" value={model.r2?.toFixed(4)} />
                                                <MetricCard label="RMSE" value={model.rmse?.toFixed(4)} />
                                                <MetricCard label="MAE" value={model.mae?.toFixed(4)} />
                                                <MetricCard label="Category" value={model.category || 'N/A'} />
                                            </>
                                        )}
                                    </div>
                                </div>

                                {model.tuning?.applied && (
                                    <div>
                                        <p className="text-sm font-semibold text-gray-900 mb-2">Hyperparameter Tuning</p>
                                        <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 space-y-1">
                                            <p><span className="font-semibold">Strategy:</span> {model.tuning.strategy || 'N/A'}</p>
                                            <p><span className="font-semibold">Best CV Score:</span> {model.tuning.best_score != null ? Number(model.tuning.best_score).toFixed(4) : 'N/A'}</p>
                                            <p><span className="font-semibold">Candidates:</span> {model.tuning.candidate_count ?? 'N/A'}</p>
                                            <p><span className="font-semibold">Best Params:</span> {model.tuning.best_params ? JSON.stringify(model.tuning.best_params) : 'N/A'}</p>
                                        </div>
                                    </div>
                                )}

                                {results.featureImportance && results.featureImportance.length > 0 && (
                                    <div>
                                        <p className="text-sm font-semibold text-gray-900 mb-3">Feature Importance</p>
                                        <div className="space-y-2">
                                            {results.featureImportance.slice(0, 5).map((feat, fidx) => (
                                                <div key={fidx} className="flex items-center justify-between">
                                                    <span className="text-sm text-gray-700 truncate max-w-[150px]">{feat.feature}</span>
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-32 bg-gray-200 rounded-full h-2">
                                                            <div
                                                                className="bg-indigo-600 h-2 rounded-full"
                                                                style={{ width: `${feat.importance * 100}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-sm font-medium text-gray-600 w-12 text-right">
                                                            {(feat.importance * 100).toFixed(1)}%
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div >
    )
}

function MetricCard({ label, value }) {
    return (
        <div className="bg-white p-3 rounded-lg border border-gray-100">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-lg font-bold text-gray-900">{value}</p>
        </div>
    )
}

export default MLResults
