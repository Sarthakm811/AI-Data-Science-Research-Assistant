import React, { useMemo, useState } from 'react'
import { Cpu, Sparkles, Layers, SlidersHorizontal, Download, CheckCircle2, AlertCircle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ScatterChart, Scatter, ZAxis } from 'recharts'
import { datasetAPI, ensureBackendDataset } from '../services/api'

function isMissing(value) {
    return value === null || value === undefined || String(value).trim() === ''
}

function toNumber(value) {
    if (value === null || value === undefined || value === '') return NaN
    const n = Number(String(value).replace(/,/g, ''))
    return Number.isFinite(n) ? n : NaN
}

function mean(values) {
    if (!values.length) return 0
    return values.reduce((sum, v) => sum + v, 0) / values.length
}

function variance(values) {
    if (values.length < 2) return 0
    const m = mean(values)
    return values.reduce((sum, v) => sum + ((v - m) ** 2), 0) / (values.length - 1)
}

function std(values) {
    return Math.sqrt(variance(values))
}

function pearsonCorrelation(x, y) {
    const pairs = []
    for (let i = 0; i < x.length; i += 1) {
        const xv = toNumber(x[ i ])
        const yv = toNumber(y[ i ])
        if (Number.isFinite(xv) && Number.isFinite(yv)) {
            pairs.push([ xv, yv ])
        }
    }

    if (pairs.length < 3) return 0

    const xs = pairs.map((p) => p[ 0 ])
    const ys = pairs.map((p) => p[ 1 ])
    const mx = mean(xs)
    const my = mean(ys)

    let num = 0
    let denX = 0
    let denY = 0
    for (let i = 0; i < pairs.length; i += 1) {
        const dx = xs[ i ] - mx
        const dy = ys[ i ] - my
        num += dx * dy
        denX += dx * dx
        denY += dy * dy
    }

    const den = Math.sqrt(denX * denY)
    if (!den) return 0
    return num / den
}

function dot(a, b) {
    let out = 0
    for (let i = 0; i < a.length; i += 1) out += a[ i ] * b[ i ]
    return out
}

function matrixVectorMultiply(matrix, vector) {
    return matrix.map((row) => dot(row, vector))
}

function normalizeVector(v) {
    const mag = Math.sqrt(v.reduce((sum, x) => sum + (x * x), 0)) || 1
    return v.map((x) => x / mag)
}

function covarianceMatrix(matrix) {
    if (!matrix.length) return []
    const cols = matrix[ 0 ].length
    const means = Array(cols).fill(0)

    matrix.forEach((row) => {
        for (let c = 0; c < cols; c += 1) means[ c ] += row[ c ]
    })
    for (let c = 0; c < cols; c += 1) means[ c ] /= matrix.length

    const cov = Array(cols).fill(0).map(() => Array(cols).fill(0))
    for (let i = 0; i < cols; i += 1) {
        for (let j = i; j < cols; j += 1) {
            let s = 0
            for (let r = 0; r < matrix.length; r += 1) {
                s += (matrix[ r ][ i ] - means[ i ]) * (matrix[ r ][ j ] - means[ j ])
            }
            const value = s / Math.max(1, matrix.length - 1)
            cov[ i ][ j ] = value
            cov[ j ][ i ] = value
        }
    }

    return cov
}

function powerIteration(matrix, iterations = 80) {
    const n = matrix.length
    if (!n) return Array(0)
    let vec = normalizeVector(Array(n).fill(0).map(() => (Math.random() * 2) - 1))

    for (let i = 0; i < iterations; i += 1) {
        vec = normalizeVector(matrixVectorMultiply(matrix, vec))
    }

    return vec
}

function pcaReduce(inputMatrix, components = 2) {
    if (!inputMatrix.length || !inputMatrix[ 0 ]?.length) return { reduced: [], varianceExplained: [] }

    const rows = inputMatrix.length
    const cols = inputMatrix[ 0 ].length

    const colMeans = Array(cols).fill(0)
    const colStds = Array(cols).fill(0)

    for (let c = 0; c < cols; c += 1) {
        const column = inputMatrix.map((r) => r[ c ])
        colMeans[ c ] = mean(column)
        colStds[ c ] = std(column) || 1
    }

    const standardized = inputMatrix.map((row) => row.map((v, c) => (v - colMeans[ c ]) / colStds[ c ]))

    const cov = covarianceMatrix(standardized)
    const k = Math.min(components, cols)

    const eigenvectors = []
    const eigenvalues = []
    let covCopy = cov.map((row) => [ ...row ])

    for (let comp = 0; comp < k; comp += 1) {
        const vec = powerIteration(covCopy)
        const mv = matrixVectorMultiply(covCopy, vec)
        const value = dot(vec, mv)

        eigenvectors.push(vec)
        eigenvalues.push(Math.max(0, value))

        for (let i = 0; i < covCopy.length; i += 1) {
            for (let j = 0; j < covCopy.length; j += 1) {
                covCopy[ i ][ j ] -= value * vec[ i ] * vec[ j ]
            }
        }
    }

    const reduced = standardized.map((row) => (
        eigenvectors.map((vec) => dot(row, vec))
    ))

    const total = eigenvalues.reduce((sum, v) => sum + v, 0) || 1
    const varianceExplained = eigenvalues.map((v) => (v / total) * 100)

    return { reduced, varianceExplained }
}

function tsneLikeReduce(inputMatrix, dimensions = 2, maxPoints = 180) {
    if (!inputMatrix.length || !inputMatrix[ 0 ]?.length) return []

    const clipped = inputMatrix.slice(0, maxPoints)
    const n = clipped.length
    const dim = Math.max(2, dimensions)

    const pcaInit = pcaReduce(clipped, dim).reduced
    let y = pcaInit.length === n
        ? pcaInit.map((row) => row.slice(0, dim).map((v) => v * 0.01))
        : Array(n).fill(0).map(() => Array(dim).fill(0).map(() => (Math.random() - 0.5) * 0.01))

    const dist = Array(n).fill(0).map(() => Array(n).fill(0))
    const allDists = []
    for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
            let s = 0
            for (let c = 0; c < clipped[ i ].length; c += 1) {
                const d = clipped[ i ][ c ] - clipped[ j ][ c ]
                s += d * d
            }
            dist[ i ][ j ] = s
            dist[ j ][ i ] = s
            allDists.push(s)
        }
    }

    const sortedDist = [ ...allDists ].sort((a, b) => a - b)
    const sigma = Math.sqrt(sortedDist[ Math.floor(sortedDist.length * 0.5) ] || 1)

    const p = Array(n).fill(0).map(() => Array(n).fill(0))
    let pSum = 0
    for (let i = 0; i < n; i += 1) {
        for (let j = 0; j < n; j += 1) {
            if (i === j) continue
            const value = Math.exp(-dist[ i ][ j ] / (2 * sigma * sigma))
            p[ i ][ j ] = value
            pSum += value
        }
    }
    pSum = pSum || 1
    for (let i = 0; i < n; i += 1) {
        for (let j = 0; j < n; j += 1) {
            p[ i ][ j ] /= pSum
        }
    }

    const velocity = Array(n).fill(0).map(() => Array(dim).fill(0))
    const lr = 120
    const momentum = 0.7

    for (let iter = 0; iter < 200; iter += 1) {
        const qNum = Array(n).fill(0).map(() => Array(n).fill(0))
        let qSum = 0

        for (let i = 0; i < n; i += 1) {
            for (let j = i + 1; j < n; j += 1) {
                let d2 = 0
                for (let c = 0; c < dim; c += 1) {
                    const d = y[ i ][ c ] - y[ j ][ c ]
                    d2 += d * d
                }
                const value = 1 / (1 + d2)
                qNum[ i ][ j ] = value
                qNum[ j ][ i ] = value
                qSum += value * 2
            }
        }

        const q = Array(n).fill(0).map(() => Array(n).fill(0))
        for (let i = 0; i < n; i += 1) {
            for (let j = 0; j < n; j += 1) {
                q[ i ][ j ] = qNum[ i ][ j ] / (qSum || 1)
            }
        }

        for (let i = 0; i < n; i += 1) {
            const grad = Array(dim).fill(0)
            for (let j = 0; j < n; j += 1) {
                if (i === j) continue
                const mult = 4 * (p[ i ][ j ] - q[ i ][ j ]) * qNum[ i ][ j ]
                for (let c = 0; c < dim; c += 1) {
                    grad[ c ] += mult * (y[ i ][ c ] - y[ j ][ c ])
                }
            }
            for (let c = 0; c < dim; c += 1) {
                velocity[ i ][ c ] = (momentum * velocity[ i ][ c ]) + (lr * grad[ c ])
                y[ i ][ c ] += velocity[ i ][ c ]
            }
        }
    }

    return y
}

function exportRowsToCsv(rows, headers, fileName) {
    const escapeValue = (v) => {
        const text = String(v ?? '')
        if (text.includes(',') || text.includes('"') || text.includes('\n')) {
            return `"${text.replace(/"/g, '""')}"`
        }
        return text
    }

    const lines = [
        headers.join(','),
        ...rows.map((row) => headers.map((h) => escapeValue(row[ h ])).join(','))
    ]

    const blob = new Blob([ lines.join('\n') ], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
}

const POSITIVE_WORDS = new Set([
    'good', 'great', 'excellent', 'positive', 'up', 'increase', 'improved', 'success', 'happy', 'love', 'profit', 'growth'
])

const NEGATIVE_WORDS = new Set([
    'bad', 'poor', 'negative', 'down', 'decrease', 'decline', 'risk', 'error', 'fail', 'loss', 'hate', 'issue'
])

function FeatureEngineering({ dataset, setDataset }) {
    const [ dateColumns, setDateColumns ] = useState([])
    const [ textColumns, setTextColumns ] = useState([])
    const [ categoricalColumns, setCategoricalColumns ] = useState([])
    const [ encodingMethod, setEncodingMethod ] = useState('onehot')
    const [ scalingMethod, setScalingMethod ] = useState('none')
    const [ createInteractions, setCreateInteractions ] = useState(false)
    const [ interactionA, setInteractionA ] = useState('')
    const [ interactionB, setInteractionB ] = useState('')
    const [ removeIrrelevant, setRemoveIrrelevant ] = useState(true)
    const [ missingThreshold, setMissingThreshold ] = useState(0.5)
    const [ varianceThreshold, setVarianceThreshold ] = useState(0)
    const [ targetColumn, setTargetColumn ] = useState('')
    const [ reductionMethod, setReductionMethod ] = useState('none')
    const [ pcaComponents, setPcaComponents ] = useState(2)
    const [ running, setRunning ] = useState(false)
    const [ message, setMessage ] = useState('')
    const [ transformed, setTransformed ] = useState(null)
    const [ savingVersion, setSavingVersion ] = useState(false)
    const [ savedDataset, setSavedDataset ] = useState(null)
    const [ downloadFormat, setDownloadFormat ] = useState('csv')

    const headers = dataset?.headers || []

    const numericColumns = useMemo(() => (
        headers.filter((h) => {
            const vals = (dataset?.rows || []).map((r) => toNumber(r[ h ])).filter((v) => Number.isFinite(v))
            return vals.length >= Math.max(5, Math.floor((dataset?.rows?.length || 0) * 0.5))
        })
    ), [ headers, dataset ])

    const likelyDateColumns = useMemo(() => (
        headers.filter((h) => /date|time|timestamp/i.test(h))
    ), [ headers ])

    const likelyTextColumns = useMemo(() => (
        headers.filter((h) => !numericColumns.includes(h) && !likelyDateColumns.includes(h))
    ), [ headers, numericColumns, likelyDateColumns ])

    const runFeatureEngineering = () => {
        if (!dataset?.rows?.length) return

        setRunning(true)
        setMessage('')

        setTimeout(() => {
            try {
                const rows = dataset.rows.map((row) => ({ ...row }))
                let engineeredHeaders = [ ...dataset.headers ]
                const notes = []

                // Date feature extraction
                dateColumns.forEach((col) => {
                    if (!engineeredHeaders.includes(col)) return
                    const yCol = `${col}_year`
                    const mCol = `${col}_month`
                    const dCol = `${col}_day`
                    const wCol = `${col}_weekday`

                    rows.forEach((row) => {
                        const date = new Date(row[ col ])
                        if (Number.isNaN(date.getTime())) {
                            row[ yCol ] = null
                            row[ mCol ] = null
                            row[ dCol ] = null
                            row[ wCol ] = null
                        } else {
                            row[ yCol ] = date.getUTCFullYear()
                            row[ mCol ] = date.getUTCMonth() + 1
                            row[ dCol ] = date.getUTCDate()
                            row[ wCol ] = date.getUTCDay()
                        }
                    })

                    engineeredHeaders.push(yCol, mCol, dCol, wCol)
                })
                if (dateColumns.length) notes.push(`Date features created for ${dateColumns.length} column(s).`)

                // Text feature extraction
                textColumns.forEach((col) => {
                    if (!engineeredHeaders.includes(col)) return
                    const wcCol = `${col}_word_count`
                    const ssCol = `${col}_sentiment_score`

                    rows.forEach((row) => {
                        const text = String(row[ col ] ?? '').toLowerCase().trim()
                        if (!text) {
                            row[ wcCol ] = 0
                            row[ ssCol ] = 0
                            return
                        }
                        const tokens = text.split(/\s+/).filter(Boolean)
                        const pos = tokens.filter((t) => POSITIVE_WORDS.has(t)).length
                        const neg = tokens.filter((t) => NEGATIVE_WORDS.has(t)).length

                        row[ wcCol ] = tokens.length
                        row[ ssCol ] = Number(((pos - neg) / Math.max(1, tokens.length)).toFixed(4))
                    })

                    engineeredHeaders.push(wcCol, ssCol)
                })
                if (textColumns.length) notes.push(`Text features created for ${textColumns.length} column(s).`)

                // Interaction features
                if (createInteractions && interactionA && interactionB && engineeredHeaders.includes(interactionA) && engineeredHeaders.includes(interactionB)) {
                    const productCol = `${interactionA}_x_${interactionB}`
                    const ratioCol = `${interactionA}_div_${interactionB}`
                    rows.forEach((row) => {
                        const a = toNumber(row[ interactionA ])
                        const b = toNumber(row[ interactionB ])
                        row[ productCol ] = Number.isFinite(a) && Number.isFinite(b) ? a * b : null
                        row[ ratioCol ] = Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? a / b : null
                    })
                    engineeredHeaders.push(productCol, ratioCol)
                    notes.push('Created numeric interaction features (product and ratio).')
                }

                // Encoding
                if (categoricalColumns.length) {
                    if (encodingMethod === 'label') {
                        categoricalColumns.forEach((col) => {
                            const unique = [ ...new Set(rows.map((row) => String(row[ col ] ?? 'missing'))) ]
                            const mapping = Object.fromEntries(unique.map((value, idx) => [ value, idx ]))
                            const encCol = `${col}_label`
                            rows.forEach((row) => {
                                row[ encCol ] = mapping[ String(row[ col ] ?? 'missing') ]
                            })
                            engineeredHeaders.push(encCol)
                        })
                        notes.push('Applied label encoding.')
                    } else {
                        categoricalColumns.forEach((col) => {
                            const unique = [ ...new Set(rows.map((row) => String(row[ col ] ?? 'missing'))) ]
                            unique.slice(0, 20).forEach((value) => {
                                const safe = value.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'value'
                                const ohCol = `${col}_oh_${safe}`
                                rows.forEach((row) => {
                                    row[ ohCol ] = String(row[ col ] ?? 'missing') === value ? 1 : 0
                                })
                                engineeredHeaders.push(ohCol)
                            })
                        })
                        notes.push('Applied one-hot encoding (max 20 categories per column).')
                    }
                }

                // Scaling
                if (scalingMethod !== 'none') {
                    const scaleCols = [ ...new Set(engineeredHeaders.filter((h) => {
                        if (h === targetColumn) return false
                        const vals = rows.map((r) => toNumber(r[ h ])).filter((v) => Number.isFinite(v))
                        return vals.length > 0
                    })) ]

                    scaleCols.forEach((col) => {
                        const vals = rows.map((r) => toNumber(r[ col ])).filter((v) => Number.isFinite(v))
                        if (!vals.length) return

                        if (scalingMethod === 'minmax') {
                            const min = Math.min(...vals)
                            const max = Math.max(...vals)
                            const denom = max - min || 1
                            rows.forEach((row) => {
                                const v = toNumber(row[ col ])
                                row[ col ] = Number.isFinite(v) ? (v - min) / denom : row[ col ]
                            })
                        } else {
                            const m = mean(vals)
                            const s = std(vals) || 1
                            rows.forEach((row) => {
                                const v = toNumber(row[ col ])
                                row[ col ] = Number.isFinite(v) ? (v - m) / s : row[ col ]
                            })
                        }
                    })
                    notes.push(`Scaled numeric features using ${scalingMethod === 'minmax' ? 'MinMax' : 'StandardScaler'} approach.`)
                }

                // Remove irrelevant features
                const droppedColumns = []
                if (removeIrrelevant) {
                    engineeredHeaders = engineeredHeaders.filter((col) => {
                        if (col === targetColumn) return true

                        const columnValues = rows.map((r) => r[ col ])
                        const missRatio = columnValues.filter((v) => isMissing(v)).length / rows.length
                        if (missRatio > missingThreshold) {
                            droppedColumns.push(col)
                            return false
                        }

                        const nums = columnValues.map((v) => toNumber(v)).filter((v) => Number.isFinite(v))
                        if (nums.length >= Math.max(5, rows.length * 0.5)) {
                            const varValue = variance(nums)
                            if (varValue <= varianceThreshold) {
                                droppedColumns.push(col)
                                return false
                            }
                        }

                        return true
                    })
                    if (droppedColumns.length) {
                        notes.push(`Removed ${droppedColumns.length} low-value feature(s).`)
                    }
                }

                // Feature importance
                let importance = []
                if (targetColumn && engineeredHeaders.includes(targetColumn)) {
                    const rawTargetValues = rows.map((r) => r[ targetColumn ])
                    // Coerce target to numbers — handles "0"/"1" strings from CSV
                    const targetValues = rawTargetValues.map((v) => {
                        const n = toNumber(v)
                        return Number.isFinite(n) ? n : null
                    })
                    const hasNumericTarget = targetValues.filter((v) => v !== null).length >= 3

                    if (hasNumericTarget) {
                        importance = engineeredHeaders
                            .filter((col) => col !== targetColumn)
                            .map((col) => {
                                const rawVals = rows.map((r) => r[ col ])
                                const numVals = rawVals.map((v) => toNumber(v))
                                // Use numeric values if available, else encode strings as indices
                                const values = numVals.every((v) => Number.isFinite(v))
                                    ? numVals
                                    : (() => {
                                        const uniq = [ ...new Set(rawVals.map(String)) ]
                                        return rawVals.map((v) => uniq.indexOf(String(v)))
                                    })()
                                const score = Math.abs(pearsonCorrelation(values, targetValues))
                                return {
                                    feature: col,
                                    importance: Number.isFinite(score) ? Number(score.toFixed(4)) : 0
                                }
                            })
                            .sort((a, b) => b.importance - a.importance)
                            .slice(0, 20)
                    }
                    if (importance.length) {
                        notes.push('Calculated feature importance ranking against target column.')
                    }
                }

                // Dimensionality reduction
                const numericFinalCols = engineeredHeaders.filter((col) => {
                    if (col === targetColumn) return false
                    const vals = rows.map((r) => toNumber(r[ col ])).filter((v) => Number.isFinite(v))
                    return vals.length >= Math.max(4, rows.length * 0.4)
                })

                let reduction = null
                if (reductionMethod !== 'none' && numericFinalCols.length >= 2) {
                    const completeRows = rows
                        .map((row, idx) => ({ idx, vector: numericFinalCols.map((c) => toNumber(row[ c ])) }))
                        .filter((item) => item.vector.every((v) => Number.isFinite(v)))

                    const matrix = completeRows.map((item) => item.vector)

                    if (matrix.length >= 5) {
                        if (reductionMethod === 'pca') {
                            const reduced = pcaReduce(matrix, Math.max(2, Number(pcaComponents) || 2))
                            reduction = {
                                method: 'PCA',
                                varianceExplained: reduced.varianceExplained,
                                points: reduced.reduced.map((v, i) => ({
                                    index: completeRows[ i ].idx + 1,
                                    dim1: v[ 0 ] ?? 0,
                                    dim2: v[ 1 ] ?? 0,
                                    target: targetColumn ? rows[ completeRows[ i ].idx ][ targetColumn ] : null
                                }))
                            }
                        } else {
                            const reduced = tsneLikeReduce(matrix, 2)
                            reduction = {
                                method: 't-SNE',
                                varianceExplained: [],
                                points: reduced.map((v, i) => ({
                                    index: completeRows[ i ].idx + 1,
                                    dim1: v[ 0 ] ?? 0,
                                    dim2: v[ 1 ] ?? 0,
                                    target: targetColumn ? rows[ completeRows[ i ].idx ][ targetColumn ] : null
                                }))
                            }
                        }
                        notes.push(`Applied ${reduction.method} dimensionality reduction.`)
                    }
                }

                const trimmedRows = rows.map((row) => {
                    const next = {}
                    engineeredHeaders.forEach((h) => {
                        next[ h ] = row[ h ]
                    })
                    return next
                })

                setTransformed({
                    rows: trimmedRows,
                    headers: engineeredHeaders,
                    rowCount: trimmedRows.length,
                    colCount: engineeredHeaders.length,
                    importance,
                    reduction,
                    notes,
                    droppedColumns
                })
                setSavedDataset(null)

                setMessage('Feature engineering completed successfully.')
            } catch (err) {
                setMessage(err?.message || 'Feature engineering failed.')
            } finally {
                setRunning(false)
            }
        }, 250)
    }

    const applyToDataset = () => {
        if (!transformed) return
        const source = savedDataset || transformed
        setDataset({
            ...dataset,
            id: savedDataset?.id || dataset?.id,
            name: savedDataset?.name || `${dataset?.name || 'dataset'}_engineered`,
            headers: source.headers,
            rows: source.rows,
            rowCount: source.rowCount,
            colCount: source.colCount
        })
    }

    const saveEngineeredVersion = async () => {
        if (!transformed) return

        setSavingVersion(true)
        try {
            const backendId = await ensureBackendDataset(dataset)
            const payload = await datasetAPI.featureEngineerDataset(backendId, {
                headers: transformed.headers,
                rows: transformed.rows,
                name: `${dataset?.name || 'dataset'}_engineered`,
                notes: transformed.notes || []
            })

            if (!payload?.dataset?.id) {
                throw new Error('Save succeeded but no dataset id was returned')
            }

            setSavedDataset(payload.dataset)
            setMessage('Engineered dataset version saved successfully.')
        } catch (err) {
            setMessage(err?.message || 'Failed to save engineered dataset version.')
        } finally {
            setSavingVersion(false)
        }
    }

    const downloadSavedDataset = async () => {
        const versionId = savedDataset?.id
        if (!versionId) {
            setMessage('Save a version first before backend download.')
            return
        }

        try {
            const blob = await datasetAPI.downloadDataset(versionId, downloadFormat)
            const url = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `${versionId}.${downloadFormat}`
            document.body.appendChild(link)
            link.click()
            link.remove()
            window.URL.revokeObjectURL(url)
        } catch (err) {
            setMessage(err?.message || 'Failed to download saved engineered dataset.')
        }
    }

    if (!dataset?.rows?.length) {
        return (
            <div className="card text-center py-16">
                <Layers size={60} className="mx-auto mb-4 text-slate-300" />
                <h2 className="text-2xl font-bold text-slate-800">No Dataset Loaded</h2>
                <p className="mt-2 text-slate-500">Upload a dataset to run feature engineering workflows.</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="card hero-contrast bg-gradient-to-r from-indigo-800 via-cyan-700 to-emerald-600 text-white">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="title-display text-2xl font-bold">Feature Engineering Studio</h1>
                        <p className="text-cyan-100">Create, encode, scale, rank, and reduce features for stronger ML pipelines.</p>
                    </div>
                    <button
                        onClick={runFeatureEngineering}
                        disabled={running}
                        className="rounded-lg bg-white px-5 py-2.5 font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-70"
                    >
                        {running ? 'Running...' : 'Run Feature Engineering'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="card">
                    <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Sparkles size={18} /> Date & Text Features</h3>

                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Date Columns</label>
                    <select
                        multiple
                        value={dateColumns}
                        onChange={(e) => setDateColumns(Array.from(e.target.selectedOptions).map((o) => o.value))}
                        className="input-field h-28"
                    >
                        {(likelyDateColumns.length ? likelyDateColumns : headers).map((col) => <option key={`date-${col}`} value={col}>{col}</option>)}
                    </select>

                    <label className="mb-1 mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">Text Columns</label>
                    <select
                        multiple
                        value={textColumns}
                        onChange={(e) => setTextColumns(Array.from(e.target.selectedOptions).map((o) => o.value))}
                        className="input-field h-28"
                    >
                        {likelyTextColumns.map((col) => <option key={`text-${col}`} value={col}>{col}</option>)}
                    </select>

                    <p className="mt-2 text-xs text-slate-500">Adds year/month/day/weekday, word count, and sentiment score.</p>
                </div>

                <div className="card">
                    <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold"><SlidersHorizontal size={18} /> Encoding & Scaling</h3>

                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Categorical Columns</label>
                    <select
                        multiple
                        value={categoricalColumns}
                        onChange={(e) => setCategoricalColumns(Array.from(e.target.selectedOptions).map((o) => o.value))}
                        className="input-field h-28"
                    >
                        {headers.filter((h) => !numericColumns.includes(h)).map((col) => <option key={`cat-${col}`} value={col}>{col}</option>)}
                    </select>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Encoding</label>
                            <select value={encodingMethod} onChange={(e) => setEncodingMethod(e.target.value)} className="input-field">
                                <option value="onehot">One Hot</option>
                                <option value="label">Label Encoding</option>
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Scaling</label>
                            <select value={scalingMethod} onChange={(e) => setScalingMethod(e.target.value)} className="input-field">
                                <option value="none">None</option>
                                <option value="minmax">MinMax</option>
                                <option value="standard">StandardScaler</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Cpu size={18} /> Selection & Reduction</h3>

                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Target Column (for feature ranking)</label>
                    <select value={targetColumn} onChange={(e) => setTargetColumn(e.target.value)} className="input-field">
                        <option value="">Select target...</option>
                        {headers.map((col) => <option key={`target-${col}`} value={col}>{col}</option>)}
                    </select>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Reduction</label>
                            <select value={reductionMethod} onChange={(e) => setReductionMethod(e.target.value)} className="input-field">
                                <option value="none">None</option>
                                <option value="pca">PCA</option>
                                <option value="tsne">t-SNE (slow &gt;100 rows)</option>
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">PCA Components</label>
                            <input
                                type="number"
                                min={2}
                                max={6}
                                value={pcaComponents}
                                onChange={(e) => setPcaComponents(Number(e.target.value))}
                                className="input-field"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="card">
                <h3 className="mb-3 text-lg font-semibold">Useful Feature Creation Rules</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <label className="rounded-lg border border-slate-200 p-3 text-sm">
                        <div className="mb-2 flex items-center justify-between">
                            <span className="font-semibold text-slate-700">Interaction Features</span>
                            <input type="checkbox" checked={createInteractions} onChange={(e) => setCreateInteractions(e.target.checked)} />
                        </div>
                        <select value={interactionA} onChange={(e) => setInteractionA(e.target.value)} className="input-field mb-2">
                            <option value="">Feature A</option>
                            {numericColumns.map((col) => <option key={`ia-${col}`} value={col}>{col}</option>)}
                        </select>
                        <select value={interactionB} onChange={(e) => setInteractionB(e.target.value)} className="input-field">
                            <option value="">Feature B</option>
                            {numericColumns.map((col) => <option key={`ib-${col}`} value={col}>{col}</option>)}
                        </select>
                    </label>

                    <label className="rounded-lg border border-slate-200 p-3 text-sm">
                        <div className="mb-2 flex items-center justify-between">
                            <span className="font-semibold text-slate-700">Remove Irrelevant</span>
                            <input type="checkbox" checked={removeIrrelevant} onChange={(e) => setRemoveIrrelevant(e.target.checked)} />
                        </div>
                        <label className="mb-1 block text-xs text-slate-500">Missing Ratio Threshold: {(missingThreshold * 100).toFixed(0)}%</label>
                        <input type="range" min={0} max={0.95} step={0.05} value={missingThreshold} onChange={(e) => setMissingThreshold(Number(e.target.value))} className="w-full" />
                        <label className="mb-1 mt-2 block text-xs text-slate-500">Variance Threshold: {varianceThreshold.toFixed(3)}</label>
                        <input type="range" min={0} max={1} step={0.01} value={varianceThreshold} onChange={(e) => setVarianceThreshold(Number(e.target.value))} className="w-full" />
                    </label>
                </div>
            </div>

            {message && (
                <div className={`card flex items-center gap-2 text-sm ${message.includes('successfully') ? 'border border-green-200 bg-green-50 text-green-800' : 'border border-red-200 bg-red-50 text-red-800'}`}>
                    {message.includes('successfully') ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    {message}
                </div>
            )}

            {transformed && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                        <div className="card text-center"><p className="text-2xl font-bold text-indigo-700">{transformed.rowCount}</p><p className="text-slate-500">Rows</p></div>
                        <div className="card text-center"><p className="text-2xl font-bold text-cyan-700">{transformed.colCount}</p><p className="text-slate-500">Features</p></div>
                        <div className="card text-center"><p className="text-2xl font-bold text-emerald-700">{transformed.notes.length}</p><p className="text-slate-500">Actions Applied</p></div>
                        <div className="card text-center"><p className="text-2xl font-bold text-rose-700">{transformed.droppedColumns.length}</p><p className="text-slate-500">Dropped Features</p></div>
                    </div>

                    <div className="card">
                        <h3 className="mb-3 text-lg font-semibold">Engineering Summary</h3>
                        <ul className="space-y-2 text-sm text-slate-700">
                            {transformed.notes.map((note, idx) => (
                                <li key={`note-${idx}`} className="rounded-md bg-slate-50 px-3 py-2">{note}</li>
                            ))}
                        </ul>
                    </div>

                    {transformed.importance.length > 0 && (
                        <div className="card">
                            <h3 className="mb-4 text-lg font-semibold">Feature Importance Ranking</h3>
                            {transformed.importance.every(f => f.importance === 0) ? (
                                <p className="text-sm text-slate-500 py-4">No correlation detected between features and target. Try selecting a numeric target column.</p>
                            ) : (
                                <ResponsiveContainer width="100%" height={Math.max(200, transformed.importance.slice(0, 12).length * 32)}>
                                    <BarChart data={transformed.importance.slice(0, 12)} layout="vertical" margin={{ left: 20, right: 40, top: 4, bottom: 4 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis type="number" domain={[ 0, 'auto' ]} tickFormatter={(v) => v.toFixed(2)} />
                                        <YAxis dataKey="feature" type="category" width={160} tick={{ fontSize: 11 }} />
                                        <Tooltip formatter={(v) => v.toFixed(4)} />
                                        <Bar dataKey="importance" fill="#0ea5e9" radius={[ 0, 4, 4, 0 ]} minPointSize={3} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    )}

                    {transformed.reduction?.points?.length > 0 && (
                        <div className="card">
                            <h3 className="mb-2 text-lg font-semibold">{transformed.reduction.method} Projection (2D)</h3>
                            {transformed.reduction.varianceExplained?.length > 0 && (
                                <p className="mb-3 text-xs text-slate-500">
                                    Variance explained: {transformed.reduction.varianceExplained.map((v, i) => `PC${i + 1} ${v.toFixed(1)}%`).join(', ')}
                                </p>
                            )}
                            <ResponsiveContainer width="100%" height={320}>
                                <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="dim1" name="Dim 1" type="number" />
                                    <YAxis dataKey="dim2" name="Dim 2" type="number" />
                                    <ZAxis dataKey="index" range={[ 50, 50 ]} />
                                    <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v, n) => [ v, n ]} />
                                    <Scatter data={transformed.reduction.points} fill="#6366f1" />
                                </ScatterChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    <div className="card">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <h3 className="text-lg font-semibold">Engineered Dataset Preview</h3>
                            <div className="flex gap-2">
                                <button onClick={applyToDataset} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Apply As Current Dataset</button>
                                <button
                                    onClick={saveEngineeredVersion}
                                    disabled={savingVersion}
                                    className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                    {savingVersion ? 'Saving...' : 'Save Engineered Version'}
                                </button>
                                <button
                                    onClick={() => exportRowsToCsv(transformed.rows, transformed.headers, `${dataset?.name || 'engineered'}_features.csv`)}
                                    className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                                >
                                    <Download size={14} /> Download CSV
                                </button>
                            </div>
                        </div>

                        {savedDataset?.id && (
                            <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
                                <p className="text-sm text-sky-900">
                                    Saved version id: <span className="font-semibold">{savedDataset.id}</span>
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <select value={downloadFormat} onChange={(e) => setDownloadFormat(e.target.value)} className="input-field max-w-[160px]">
                                        <option value="csv">CSV</option>
                                        <option value="json">JSON</option>
                                    </select>
                                    <button onClick={downloadSavedDataset} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-900">
                                        Download Saved Version
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50">
                                        {transformed.headers.slice(0, 18).map((h) => (
                                            <th key={`h-${h}`} className="border-b px-3 py-2 text-left font-semibold text-slate-700">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {transformed.rows.slice(0, 8).map((row, rIdx) => (
                                        <tr key={`r-${rIdx}`} className="hover:bg-slate-50">
                                            {transformed.headers.slice(0, 18).map((h) => (
                                                <td key={`c-${rIdx}-${h}`} className="border-b px-3 py-2 text-slate-600">{String(row[ h ] ?? '')}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {transformed.headers.length > 18 && <p className="mt-2 text-xs text-slate-500">Showing first 18 columns and 8 rows for preview.</p>}
                    </div>
                </div>
            )}
        </div>
    )
}

export default FeatureEngineering
