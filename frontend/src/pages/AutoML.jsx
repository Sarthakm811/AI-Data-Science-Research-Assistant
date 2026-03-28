import React, { useMemo, useState } from 'react'
import { Play, AlertCircle } from 'lucide-react'
import MLResults from '../components/MLResults'
import { useAnalysis } from '../context/AnalysisContext'

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

const MODEL_OPTIONS = [
    { label: 'Linear Regression', value: 'Linear Regression', mode: 'regression' },
    { label: 'Decision Tree', value: 'Decision Tree', mode: 'regression' },
    { label: 'Random Forest', value: 'Random Forest', mode: 'regression' },
    { label: 'SVM', value: 'SVM', mode: 'regression' },
    { label: 'KNN', value: 'KNN', mode: 'regression' },
    { label: 'XGBoost', value: 'XGBoost', mode: 'regression' },
    { label: 'Logistic Regression', value: 'Logistic Regression', mode: 'classification' },
    { label: 'Decision Tree', value: 'Decision Tree', mode: 'classification' },
    { label: 'Random Forest', value: 'Random Forest', mode: 'classification' },
    { label: 'SVM', value: 'SVM', mode: 'classification' },
    { label: 'KNN', value: 'KNN', mode: 'classification' },
    { label: 'XGBoost', value: 'XGBoost', mode: 'classification' },
    { label: 'Random Forest', value: 'Random Forest', mode: 'multi_output' },
    { label: 'Linear Regression', value: 'Linear Regression', mode: 'multi_output' },
    { label: 'XGBoost', value: 'XGBoost', mode: 'multi_output' }
]

const CLUSTERING_ALGORITHMS = [
    { label: 'KMeans', value: 'kmeans' },
    { label: 'DBSCAN', value: 'dbscan' },
    { label: 'Agglomerative', value: 'agglomerative' }
]

const MAX_CATEGORICAL_CARDINALITY = 20

function inferColumnMeta(dataset) {
    if (!dataset?.headers?.length) return {}

    const rows = dataset.rows || []
    const meta = {}

    dataset.headers.forEach((header) => {
        const values = rows.map((r) => r?.[ header ]).filter((v) => v !== undefined && v !== null && v !== '')
        const numericValues = values.map((v) => Number(v)).filter((v) => Number.isFinite(v))
        const isNumeric = values.length > 0 && numericValues.length / values.length >= 0.9
        const uniqueCount = new Set(values.map((v) => String(v))).size

        meta[ header ] = {
            isNumeric,
            uniqueCount,
            isLikelyCategorical: !isNumeric || uniqueCount <= MAX_CATEGORICAL_CARDINALITY,
            isLikelyContinuous: isNumeric && uniqueCount > MAX_CATEGORICAL_CARDINALITY
        }
    })

    return meta
}

function AutoML({ dataset, setDataset }) {
    const [ training, setTraining ] = useState(false)
    const [ syncingDataset, setSyncingDataset ] = useState(false)
    const [ results, setResults ] = useState(null)
    const [ error, setError ] = useState(null)
    const [ recommendationNote, setRecommendationNote ] = useState('')
    const [ syncedDatasetId, setSyncedDatasetId ] = useState(null)
    const [ config, setConfig ] = useState({
        workflow: 'selected',
        modelMode: 'regression',
        modelName: 'Linear Regression',
        xColumns: [],
        yColumns: [],
        hyperparameterTuning: false,
        nTrials: 30,
        cvFolds: 5,
        clusteringAlgorithm: 'kmeans',
        nClusters: 3,
        eps: 0.5,
        minSamples: 5,
        businessMetric: 'r2',
        businessTarget: 0.8,
        businessDirection: '>='
    })

    const { setMlResults } = useAnalysis()

    const columnMeta = useMemo(() => inferColumnMeta(dataset), [ dataset ])

    const modelChoices = useMemo(
        () => MODEL_OPTIONS.filter((m) => m.mode === config.modelMode),
        [ config.modelMode ]
    )

    const yCandidateColumns = useMemo(() => {
        if (!dataset?.headers) return []

        if (config.workflow === 'clustering') {
            return []
        }

        if (config.modelMode === 'regression') {
            return dataset.headers.filter((h) => columnMeta[ h ]?.isLikelyContinuous)
        }

        if (config.modelMode === 'classification') {
            return dataset.headers.filter((h) => columnMeta[ h ]?.isLikelyCategorical)
        }

        return dataset.headers
    }, [ dataset, config.modelMode, config.workflow, columnMeta ])

    const xCandidateColumns = useMemo(() => {
        if (!dataset?.headers) return []
        return dataset.headers.filter((h) => !config.yColumns.includes(h))
    }, [ dataset, config.yColumns ])

    const ySelectionRuleText = useMemo(() => {
        if (config.workflow === 'clustering') return 'Clustering is unsupervised: pick X features only, no Y target.'
        if (config.workflow === 'compare') return 'Compare mode supports one Y target for classification/regression with CV and optional tuning.'
        if (config.modelMode === 'regression') return 'Regression model: choose exactly 1 continuous Y target.'
        if (config.modelMode === 'classification') return 'Classification model: choose exactly 1 categorical Y target.'
        return 'Multi-output model: choose 2 or more Y targets.'
    }, [ config.modelMode, config.workflow ])

    const businessMetricOptions = useMemo(() => {
        if (config.workflow === 'clustering') {
            return [
                { value: 'silhouette', label: 'Silhouette Score', direction: '>=' },
                { value: 'inertia', label: 'Inertia', direction: '<=' }
            ]
        }

        if (config.modelMode === 'classification') {
            return [
                { value: 'accuracy', label: 'Accuracy', direction: '>=' },
                { value: 'precision', label: 'Precision', direction: '>=' },
                { value: 'recall', label: 'Recall', direction: '>=' },
                { value: 'f1', label: 'F1 Score', direction: '>=' },
                { value: 'roc_auc', label: 'ROC-AUC', direction: '>=' }
            ]
        }

        return [
            { value: 'r2', label: 'R² Score', direction: '>=' },
            { value: 'mae', label: 'MAE', direction: '<=' },
            { value: 'mse', label: 'MSE', direction: '<=' },
            { value: 'rmse', label: 'RMSE', direction: '<=' }
        ]
    }, [ config.workflow, config.modelMode ])

    const isSelectionValid = useMemo(() => {
        if (config.xColumns.length < 1) return false

        if (config.workflow === 'clustering') {
            return config.xColumns.length >= 2
        }

        if (config.workflow === 'compare') {
            if (config.modelMode === 'multi_output') return false
            return config.yColumns.length === 1
        }

        if (!config.modelName) return false
        if (config.modelMode === 'multi_output') return config.yColumns.length >= 2
        return config.yColumns.length === 1
    }, [ config ])

    const datasetSignature = useMemo(() => {
        if (!dataset) return ''
        const headers = (dataset.headers || []).join('|')
        const rowCount = dataset.rowCount || 0
        const firstRow = JSON.stringify((dataset.rows || [])[ 0 ] || {})
        return `${dataset.name || 'dataset'}::${headers}::${rowCount}::${firstRow}`
    }, [ dataset ])

    const buildCsvFromDataset = () => {
        const headers = dataset?.headers || []
        const rows = dataset?.rows || []
        const escapeCell = (value) => {
            const text = value == null ? '' : String(value)
            if (text.includes(',') || text.includes('"') || text.includes('\n')) {
                return `"${text.replace(/"/g, '""')}"`
            }
            return text
        }

        const csvRows = [
            headers.map(escapeCell).join(','),
            ...rows.map((row) => headers.map((h) => escapeCell(row?.[ h ])).join(','))
        ]
        return csvRows.join('\n')
    }

    const ensureDatasetOnBackend = async () => {
        if (dataset?.id) return dataset.id

        const cacheKey = `automl_dataset_sync::${datasetSignature}`
        const cachedId = window.sessionStorage.getItem(cacheKey)
        if (cachedId) {
            setSyncedDatasetId(cachedId)
            return cachedId
        }

        setSyncingDataset(true)
        try {
            const csvText = buildCsvFromDataset()
            const formData = new FormData()
            const uploadName = (dataset?.name || 'dataset').endsWith('.csv')
                ? (dataset?.name || 'dataset.csv')
                : `${dataset?.name || 'dataset'}.csv`
            const file = new File([ csvText ], uploadName, { type: 'text/csv' })
            formData.append('file', file)

            const uploadResp = await fetch(`${API_BASE_URL}/api/dataset/upload`, {
                method: 'POST',
                body: formData
            })
            const uploadPayload = await uploadResp.json()
            if (!uploadResp.ok) {
                throw new Error(uploadPayload?.detail || 'Failed to sync dataset to backend')
            }

            const backendId = uploadPayload?.id
            if (!backendId) {
                throw new Error('Backend dataset id missing after upload')
            }

            window.sessionStorage.setItem(cacheKey, backendId)
            setSyncedDatasetId(backendId)
            return backendId
        } finally {
            setSyncingDataset(false)
        }
    }

    const setModelMode = (mode) => {
        if (mode === 'clustering') {
            setConfig((prev) => ({
                ...prev,
                workflow: 'clustering',
                modelMode: 'classification',
                yColumns: []
            }))
            return
        }

        const nextModel = MODEL_OPTIONS.find((m) => m.mode === mode)
        const nextBusinessMetric = mode === 'classification' ? 'accuracy' : 'r2'
        setConfig((prev) => ({
            ...prev,
            workflow: prev.workflow === 'clustering' ? 'selected' : prev.workflow,
            modelMode: mode,
            modelName: nextModel?.value || prev.modelName,
            xColumns: [],
            yColumns: [],
            businessMetric: nextBusinessMetric,
            businessDirection: '>=',
            businessTarget: nextBusinessMetric === 'r2' ? 0.8 : 0.9
        }))
    }

    const handleWorkflowChange = (workflow) => {
        setRecommendationNote('')
        setConfig((prev) => {
            if (workflow === 'clustering') {
                return {
                    ...prev,
                    workflow,
                    yColumns: [],
                    modelMode: prev.modelMode === 'multi_output' ? 'classification' : prev.modelMode,
                    businessMetric: 'silhouette',
                    businessDirection: '>=',
                    businessTarget: 0.5
                }
            }

            if (workflow === 'compare' && prev.modelMode === 'multi_output') {
                const fallbackModel = MODEL_OPTIONS.find((m) => m.mode === 'classification')
                return {
                    ...prev,
                    workflow,
                    modelMode: 'classification',
                    modelName: fallbackModel?.value || prev.modelName,
                    yColumns: prev.yColumns.slice(0, 1),
                    businessMetric: 'accuracy',
                    businessDirection: '>=',
                    businessTarget: 0.9
                }
            }

            return { ...prev, workflow }
        })
    }

    const autoRecommendWorkflow = () => {
        const rowCount = Number(dataset?.rowCount || 0)
        const columnCount = Number(dataset?.colCount || 0)
        const numericColumns = (dataset?.headers || []).filter((h) => columnMeta[ h ]?.isNumeric)
        const likelyTargets = (dataset?.headers || []).filter((h) => /target|label|class|outcome|y$/i.test(String(h)))

        if (!dataset?.headers?.length) return

        // If no target-like columns and mostly numeric data, clustering is a practical default.
        if (!likelyTargets.length && numericColumns.length >= Math.max(2, Math.floor(columnCount * 0.6))) {
            setConfig((prev) => ({
                ...prev,
                workflow: 'clustering',
                yColumns: [],
                xColumns: numericColumns.slice(0, Math.min(8, numericColumns.length)),
                modelMode: prev.modelMode === 'multi_output' ? 'classification' : prev.modelMode,
                businessMetric: 'silhouette',
                businessDirection: '>=',
                businessTarget: 0.5
            }))
            setRecommendationNote(
                `Recommended clustering: no clear target column detected, and ${numericColumns.length} numeric features are available.`
            )
            return
        }

        const suggestedTarget = likelyTargets[ 0 ] || dataset.headers.find((h) => columnMeta[ h ]?.isLikelyCategorical) || dataset.headers[ 0 ]
        const suggestedMode = columnMeta[ suggestedTarget ]?.isLikelyContinuous ? 'regression' : 'classification'
        const xColumns = (dataset.headers || []).filter((h) => h !== suggestedTarget).slice(0, Math.max(3, Math.min(12, columnCount - 1)))

        // Larger datasets benefit more from compare flow with CV/tuning.
        const suggestedWorkflow = rowCount >= 200 ? 'compare' : 'selected'
        const fallbackModel = MODEL_OPTIONS.find((m) => m.mode === suggestedMode)
        const suggestedBusinessMetric = suggestedMode === 'classification' ? 'accuracy' : 'r2'

        setConfig((prev) => ({
            ...prev,
            workflow: suggestedWorkflow,
            modelMode: suggestedMode,
            modelName: fallbackModel?.value || prev.modelName,
            xColumns,
            yColumns: suggestedTarget ? [ suggestedTarget ] : [],
            businessMetric: suggestedBusinessMetric,
            businessDirection: '>=',
            businessTarget: suggestedBusinessMetric === 'r2' ? 0.8 : 0.9
        }))

        const workflowReason = suggestedWorkflow === 'compare'
            ? `dataset has ${rowCount} rows, so compare mode with CV is preferred`
            : `dataset has ${rowCount} rows, so selected model mode is faster for iteration`
        setRecommendationNote(
            `Recommended ${suggestedWorkflow} workflow (${workflowReason}); target '${suggestedTarget}' appears ${suggestedMode}.`
        )
    }

    const toggleXColumn = (column) => {
        setConfig((prev) => {
            const exists = prev.xColumns.includes(column)
            const next = exists ? prev.xColumns.filter((c) => c !== column) : [ ...prev.xColumns, column ]
            return { ...prev, xColumns: next }
        })
    }

    const toggleYColumn = (column) => {
        if (config.workflow === 'clustering') return

        setConfig((prev) => {
            const exists = prev.yColumns.includes(column)

            if (prev.modelMode !== 'multi_output') {
                return {
                    ...prev,
                    yColumns: exists ? [] : [ column ],
                    xColumns: prev.xColumns.filter((c) => c !== column)
                }
            }

            const nextY = exists
                ? prev.yColumns.filter((c) => c !== column)
                : [ ...prev.yColumns, column ]

            return {
                ...prev,
                yColumns: nextY,
                xColumns: prev.xColumns.filter((c) => c !== column)
            }
        })
    }

    const trainModels = async () => {
        if (!dataset) {
            setError('No dataset loaded.')
            return
        }

        if (!isSelectionValid) {
            setError('Please select model, valid X columns, and valid Y columns for the chosen task.')
            return
        }

        setTraining(true)
        setError(null)

        try {
            const backendDatasetId = await ensureDatasetOnBackend()

            let response
            if (config.workflow === 'clustering') {
                response = await fetch(`${API_BASE_URL}/api/ml/cluster`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        dataset_id: backendDatasetId,
                        x_columns: config.xColumns,
                        algorithm: config.clusteringAlgorithm,
                        n_clusters: config.nClusters,
                        eps: config.eps,
                        min_samples: config.minSamples
                    })
                })
            } else if (config.workflow === 'compare') {
                response = await fetch(`${API_BASE_URL}/api/ml/train`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        datasetId: backendDatasetId,
                        targetColumn: config.yColumns[ 0 ],
                        taskType: config.modelMode,
                        useGpu: true,
                        hyperparameterTuning: config.hyperparameterTuning,
                        nTrials: config.nTrials,
                        cvFolds: config.cvFolds,
                        testSize: 0.2
                    })
                })
            } else {
                response = await fetch(`${API_BASE_URL}/api/ml/train-selected`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        dataset_id: backendDatasetId,
                        model_name: config.modelName,
                        x_columns: config.xColumns,
                        y_columns: config.yColumns,
                        task_type: config.modelMode
                    })
                })
            }

            const payload = await response.json()
            if (!response.ok) {
                throw new Error(payload?.detail || 'Training failed')
            }

            const normalized = {
                ...payload,
                taskType: payload.taskType || payload.task_type || (config.workflow === 'clustering' ? 'clustering' : config.modelMode),
                selectedModel: config.workflow === 'selected' ? config.modelName : (payload.best_model_name || payload.model_name || config.modelName),
                selectedX: config.xColumns,
                selectedY: config.yColumns,
                dataset_id: backendDatasetId,
                business_context: {
                    metric: config.businessMetric,
                    target: Number(config.businessTarget),
                    direction: config.businessDirection,
                }
            }

            setResults(normalized)
            setMlResults(normalized)
        } catch (err) {
            setError(err.message || 'Training failed')
        } finally {
            setTraining(false)
        }
    }

    const applyClusterLabelsToDataset = () => {
        if (!results || String(results.taskType || results.task_type || '').toLowerCase() !== 'clustering') {
            return
        }

        const assignments = Array.isArray(results.cluster_assignments) ? results.cluster_assignments : []
        if (!assignments.length) {
            setError('No cluster assignments found to apply.')
            return
        }

        const clusterColumn = results.cluster_column || 'cluster'
        const assignmentMap = new Map()
        assignments.forEach((item) => {
            if (typeof item?.row_index === 'number') {
                assignmentMap.set(item.row_index, item.cluster)
            }
        })

        const updatedRows = (dataset.rows || []).map((row, idx) => ({
            ...row,
            [ clusterColumn ]: assignmentMap.has(idx) ? assignmentMap.get(idx) : null,
        }))

        const nextHeaders = dataset.headers.includes(clusterColumn)
            ? dataset.headers
            : [ ...dataset.headers, clusterColumn ]

        setDataset({
            ...dataset,
            headers: nextHeaders,
            rows: updatedRows,
            colCount: nextHeaders.length,
        })

        setRecommendationNote(`Applied clustering labels to current dataset as column '${clusterColumn}'.`)
    }

    if (!dataset) {
        return (
            <div className="card fade-up p-8 text-center">
                <AlertCircle className="w-12 h-12 text-yellow-600 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-gray-900 mb-2">No Dataset Loaded</h2>
                <p className="text-gray-600">Please load a dataset first to train ML models</p>
            </div>
        )
    }

    return (
        <div className="space-y-6 fade-up">
            <div className="card hero-contrast lift-hover bg-gradient-to-r from-blue-800 via-teal-700 to-orange-600 text-white">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="title-display text-2xl font-bold">Auto ML</h1>
                        <p className="text-cyan-100">Dynamic model, feature, and target selection with task-aware metrics</p>
                        <p className="mt-1 text-xs text-cyan-100">
                            Dataset sync: {dataset?.id || syncedDatasetId ? 'ready' : (syncingDataset ? 'syncing...' : 'will auto-sync on train')}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                        <label className="mb-1 block text-sm font-medium text-white">Workflow</label>
                        <select
                            value={config.workflow}
                            onChange={(e) => handleWorkflowChange(e.target.value)}
                            className="input-field"
                        >
                            <option value="selected">Selected Model</option>
                            <option value="compare">Train & Compare Models</option>
                            <option value="clustering">Clustering</option>
                        </select>
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-white">Model Mode</label>
                        <select
                            value={config.modelMode}
                            onChange={(e) => setModelMode(e.target.value)}
                            className="input-field"
                            disabled={config.workflow === 'clustering'}
                        >
                            <option value="regression">Regression</option>
                            <option value="classification">Classification</option>
                            <option value="multi_output">Multi-output</option>
                        </select>
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-white">Model Selection</label>
                        {config.workflow === 'selected' ? (
                            <select
                                value={config.modelName}
                                onChange={(e) => setConfig((prev) => ({ ...prev, modelName: e.target.value }))}
                                className="input-field"
                            >
                                {modelChoices.map((m, i) => (
                                    <option key={`${m.mode}-${m.value}-${i}`} value={m.value}>{m.label}</option>
                                ))}
                            </select>
                        ) : config.workflow === 'compare' ? (
                            <div className="grid grid-cols-2 gap-2">
                                <label className="flex items-center gap-2 text-xs">
                                    <input
                                        type="checkbox"
                                        checked={config.hyperparameterTuning}
                                        onChange={(e) => setConfig((prev) => ({ ...prev, hyperparameterTuning: e.target.checked }))}
                                    />
                                    Hyperparameter Tuning
                                </label>
                                <input
                                    type="number"
                                    className="input-field"
                                    min={5}
                                    max={200}
                                    value={config.nTrials}
                                    onChange={(e) => setConfig((prev) => ({ ...prev, nTrials: Number(e.target.value) }))}
                                    title="Random/Grid search trials"
                                />
                                <label className="text-xs text-cyan-100">CV folds</label>
                                <input
                                    type="number"
                                    className="input-field"
                                    min={2}
                                    max={10}
                                    value={config.cvFolds}
                                    onChange={(e) => setConfig((prev) => ({ ...prev, cvFolds: Number(e.target.value) }))}
                                />
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                <select
                                    value={config.clusteringAlgorithm}
                                    onChange={(e) => setConfig((prev) => ({ ...prev, clusteringAlgorithm: e.target.value }))}
                                    className="input-field"
                                >
                                    {CLUSTERING_ALGORITHMS.map((algo) => <option key={algo.value} value={algo.value}>{algo.label}</option>)}
                                </select>
                                <input
                                    type="number"
                                    min={2}
                                    max={20}
                                    className="input-field"
                                    value={config.nClusters}
                                    onChange={(e) => setConfig((prev) => ({ ...prev, nClusters: Number(e.target.value) }))}
                                    title="Clusters"
                                />
                                <input
                                    type="number"
                                    step={0.1}
                                    min={0.1}
                                    className="input-field"
                                    value={config.eps}
                                    onChange={(e) => setConfig((prev) => ({ ...prev, eps: Number(e.target.value) }))}
                                    title="DBSCAN eps"
                                />
                                <input
                                    type="number"
                                    min={2}
                                    className="input-field"
                                    value={config.minSamples}
                                    onChange={(e) => setConfig((prev) => ({ ...prev, minSamples: Number(e.target.value) }))}
                                    title="DBSCAN min samples"
                                />
                            </div>
                        )}
                    </div>
                </div>

                <div className="mb-4">
                    <button
                        onClick={autoRecommendWorkflow}
                        className="btn-secondary w-full border-white/40 bg-white/15 text-white hover:bg-white/25"
                    >
                        Auto Recommend Workflow + Columns
                    </button>
                    {recommendationNote && (
                        <p className="mt-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs text-cyan-50">
                            {recommendationNote}
                        </p>
                    )}
                </div>

                <div className="mb-4">
                    <button
                        onClick={trainModels}
                        disabled={training || syncingDataset || !isSelectionValid}
                        className="btn-primary w-full flex items-center justify-center gap-2"
                    >
                        <Play size={18} />
                        {training ? 'Training...' : syncingDataset ? 'Syncing Dataset...' : config.workflow === 'compare' ? 'Train & Compare All Models' : config.workflow === 'clustering' ? 'Run Clustering' : 'Train Selected Model'}
                    </button>
                </div>

                <div className="mb-4 rounded-xl border border-white/20 bg-white/15 p-4 backdrop-blur-sm">
                    <p className="text-sm text-white">
                        <strong>Rule:</strong> {ySelectionRuleText}
                    </p>
                </div>

                <div className="mb-4 rounded-xl border border-white/20 bg-white/10 p-4">
                    <h3 className="section-title mb-2 text-white">Business Metric Alignment</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <select
                            value={config.businessMetric}
                            onChange={(e) => {
                                const option = businessMetricOptions.find((o) => o.value === e.target.value)
                                setConfig((prev) => ({
                                    ...prev,
                                    businessMetric: e.target.value,
                                    businessDirection: option?.direction || prev.businessDirection,
                                }))
                            }}
                            className="input-field"
                        >
                            {businessMetricOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                        <select
                            value={config.businessDirection}
                            onChange={(e) => setConfig((prev) => ({ ...prev, businessDirection: e.target.value }))}
                            className="input-field"
                        >
                            <option value={'>='}>At least (greater or equal)</option>
                            <option value={'<='}>At most (less or equal)</option>
                        </select>
                        <input
                            type="number"
                            step="0.01"
                            value={config.businessTarget}
                            onChange={(e) => setConfig((prev) => ({ ...prev, businessTarget: Number(e.target.value) }))}
                            className="input-field"
                            placeholder="Target value"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-white/20 bg-white/10 p-4">
                        <h3 className="section-title mb-2 text-white">X Features (Multiple Allowed)</h3>
                        <div className="max-h-52 overflow-y-auto space-y-1">
                            {xCandidateColumns.map((col) => (
                                <label key={`x-${col}`} className="flex items-center gap-2 text-sm text-cyan-50">
                                    <input
                                        type="checkbox"
                                        checked={config.xColumns.includes(col)}
                                        onChange={() => toggleXColumn(col)}
                                    />
                                    <span>{col}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-xl border border-white/20 bg-white/10 p-4">
                        <h3 className="section-title mb-2 text-white">
                            {config.workflow === 'clustering' ? 'Y Target (Not used for clustering)' : `Y Target${config.modelMode === 'multi_output' ? 's (Multiple Required)' : ' (Single Required)'}`}
                        </h3>
                        <div className="max-h-52 overflow-y-auto space-y-1">
                            {yCandidateColumns.length === 0 && <p className="text-xs text-cyan-100">No Y target required in this workflow.</p>}
                            {yCandidateColumns.map((col) => (
                                <label key={`y-${col}`} className="flex items-center gap-2 text-sm text-cyan-50">
                                    <input
                                        type={config.modelMode === 'multi_output' ? 'checkbox' : 'radio'}
                                        name="yTarget"
                                        checked={config.yColumns.includes(col)}
                                        onChange={() => toggleYColumn(col)}
                                        disabled={config.workflow === 'clustering'}
                                    />
                                    <span>{col}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="mt-4 rounded-xl border border-white/20 bg-white/15 p-4 text-cyan-50">
                    <p className="text-sm">
                        <strong>Dataset:</strong> {dataset.name} |
                        <strong> Rows:</strong> {dataset.rowCount} |
                        <strong> Columns:</strong> {dataset.colCount}
                    </p>
                    <p className="mt-1 text-sm">
                        <strong>Selected Model:</strong> {config.modelName} |
                        <strong> X Count:</strong> {config.xColumns.length} |
                        <strong> Y Count:</strong> {config.yColumns.length}
                    </p>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                    <div className="flex items-center gap-3">
                        <AlertCircle size={20} className="text-red-600" />
                        <div>
                            <p className="font-semibold text-red-800">Error</p>
                            <p className="text-red-700 text-sm">{error}</p>
                        </div>
                    </div>
                </div>
            )}

            {results && <MLResults results={results} onApplyClusterToDataset={applyClusterLabelsToDataset} />}
        </div>
    )
}

export default AutoML
