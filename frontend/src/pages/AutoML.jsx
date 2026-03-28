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

function AutoML({ dataset }) {
    const [ training, setTraining ] = useState(false)
    const [ syncingDataset, setSyncingDataset ] = useState(false)
    const [ results, setResults ] = useState(null)
    const [ error, setError ] = useState(null)
    const [ syncedDatasetId, setSyncedDatasetId ] = useState(null)
    const [ config, setConfig ] = useState({
        modelMode: 'regression',
        modelName: 'Linear Regression',
        xColumns: [],
        yColumns: []
    })

    const { setMlResults } = useAnalysis()

    const columnMeta = useMemo(() => inferColumnMeta(dataset), [ dataset ])

    const modelChoices = useMemo(
        () => MODEL_OPTIONS.filter((m) => m.mode === config.modelMode),
        [ config.modelMode ]
    )

    const yCandidateColumns = useMemo(() => {
        if (!dataset?.headers) return []

        if (config.modelMode === 'regression') {
            return dataset.headers.filter((h) => columnMeta[ h ]?.isLikelyContinuous)
        }

        if (config.modelMode === 'classification') {
            return dataset.headers.filter((h) => columnMeta[ h ]?.isLikelyCategorical)
        }

        return dataset.headers
    }, [ dataset, config.modelMode, columnMeta ])

    const xCandidateColumns = useMemo(() => {
        if (!dataset?.headers) return []
        return dataset.headers.filter((h) => !config.yColumns.includes(h))
    }, [ dataset, config.yColumns ])

    const ySelectionRuleText = useMemo(() => {
        if (config.modelMode === 'regression') return 'Regression model: choose exactly 1 continuous Y target.'
        if (config.modelMode === 'classification') return 'Classification model: choose exactly 1 categorical Y target.'
        return 'Multi-output model: choose 2 or more Y targets.'
    }, [ config.modelMode ])

    const isSelectionValid = useMemo(() => {
        if (!config.modelName) return false
        if (config.xColumns.length < 1) return false
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
        const nextModel = MODEL_OPTIONS.find((m) => m.mode === mode)
        setConfig((prev) => ({
            ...prev,
            modelMode: mode,
            modelName: nextModel?.value || prev.modelName,
            xColumns: [],
            yColumns: []
        }))
    }

    const toggleXColumn = (column) => {
        setConfig((prev) => {
            const exists = prev.xColumns.includes(column)
            const next = exists ? prev.xColumns.filter((c) => c !== column) : [ ...prev.xColumns, column ]
            return { ...prev, xColumns: next }
        })
    }

    const toggleYColumn = (column) => {
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

            const response = await fetch(`${API_BASE_URL}/api/ml/train-selected`, {
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

            const payload = await response.json()
            if (!response.ok) {
                throw new Error(payload?.detail || 'Training failed')
            }

            const normalized = {
                ...payload,
                taskType: payload.taskType || payload.task_type || config.modelMode,
                selectedModel: config.modelName,
                selectedX: config.xColumns,
                selectedY: config.yColumns,
                dataset_id: backendDatasetId
            }

            setResults(normalized)
            setMlResults(normalized)
        } catch (err) {
            setError(err.message || 'Training failed')
        } finally {
            setTraining(false)
        }
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
            <div className="card lift-hover bg-gradient-to-r from-blue-800 via-teal-700 to-orange-600 text-white">
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
                        <label className="mb-1 block text-sm font-medium text-white">Model Mode</label>
                        <select
                            value={config.modelMode}
                            onChange={(e) => setModelMode(e.target.value)}
                            className="input-field"
                        >
                            <option value="regression">Regression</option>
                            <option value="classification">Classification</option>
                            <option value="multi_output">Multi-output</option>
                        </select>
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-white">Model Selection</label>
                        <select
                            value={config.modelName}
                            onChange={(e) => setConfig((prev) => ({ ...prev, modelName: e.target.value }))}
                            className="input-field"
                        >
                            {modelChoices.map((m, i) => (
                                <option key={`${m.mode}-${m.value}-${i}`} value={m.value}>{m.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-end">
                        <button
                            onClick={trainModels}
                            disabled={training || syncingDataset || !isSelectionValid}
                            className="btn-primary w-full flex items-center justify-center gap-2"
                        >
                            <Play size={18} />
                            {training ? 'Training...' : syncingDataset ? 'Syncing Dataset...' : 'Train Selected Model'}
                        </button>
                    </div>
                </div>

                <div className="mb-4 rounded-xl border border-white/20 bg-white/15 p-4 backdrop-blur-sm">
                    <p className="text-sm text-white">
                        <strong>Rule:</strong> {ySelectionRuleText}
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-white/20 bg-white/10 p-4">
                        <h3 className="mb-2 font-semibold text-white">X Features (Multiple Allowed)</h3>
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
                        <h3 className="mb-2 font-semibold text-white">
                            Y Target{config.modelMode === 'multi_output' ? 's (Multiple Required)' : ' (Single Required)'}
                        </h3>
                        <div className="max-h-52 overflow-y-auto space-y-1">
                            {yCandidateColumns.map((col) => (
                                <label key={`y-${col}`} className="flex items-center gap-2 text-sm text-cyan-50">
                                    <input
                                        type={config.modelMode === 'multi_output' ? 'checkbox' : 'radio'}
                                        name="yTarget"
                                        checked={config.yColumns.includes(col)}
                                        onChange={() => toggleYColumn(col)}
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

            {results && <MLResults results={results} />}
        </div>
    )
}

export default AutoML
