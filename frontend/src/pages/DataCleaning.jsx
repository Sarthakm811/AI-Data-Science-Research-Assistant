import React, { useMemo, useState } from 'react'
import { Sparkles, Wand2, AlertCircle, CheckCircle2, SlidersHorizontal, Download, ChevronDown, ChevronUp } from 'lucide-react'

const API_BASE_URL = import.meta.env.VITE_API_URL || ''
const DEFAULT_STOPWORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he', 'in', 'is',
    'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were', 'will', 'with', 'or', 'not'
])

const CLEANING_PRESETS = {
    quick_cleanup: {
        label: 'Quick Cleanup',
        description: 'Fast baseline cleaning for most tabular datasets.',
        config: {
            missingStrategy: 'fill_mean',
            trimText: true,
            removeDuplicates: true,
            handleOutliers: false,
            typeFixerEnabled: true,
            textCleanerEnabled: false,
            categoryStandardizeEnabled: false,
            noiseSmoothingEnabled: false
        }
    },
    nlp_text: {
        label: 'NLP Text Prep',
        description: 'Normalize and clean free-text columns for language tasks.',
        config: {
            trimText: true,
            textCleanerEnabled: true,
            textLowercase: true,
            textRemovePunctuation: true,
            textRemoveStopwords: true,
            missingStrategy: 'fill_mode',
            typeFixerEnabled: false,
            categoryStandardizeEnabled: false,
            noiseSmoothingEnabled: false
        }
    },
    business_standard: {
        label: 'Business Standard',
        description: 'Standardize mixed business data with type and category cleanup.',
        config: {
            missingStrategy: 'fill_mode',
            trimText: true,
            removeDuplicates: true,
            typeFixerEnabled: true,
            textCleanerEnabled: true,
            textLowercase: false,
            textRemovePunctuation: false,
            textRemoveStopwords: false,
            categoryStandardizeEnabled: true,
            categoryCase: 'title',
            noiseSmoothingEnabled: false
        }
    },
    sensor_smoothing: {
        label: 'Sensor Smoothing',
        description: 'Reduce numeric noise in sequential/signal-like datasets.',
        config: {
            missingStrategy: 'fill_median',
            handleOutliers: true,
            outlierAction: 'clip',
            noiseSmoothingEnabled: true,
            noiseSmoothingMethod: 'rolling_median',
            noiseSmoothingWindow: 5,
            typeFixerEnabled: true,
            textCleanerEnabled: false,
            categoryStandardizeEnabled: false
        }
    }
}

function toNumber(value) {
    if (value === null || value === undefined || value === '') return NaN
    const parsed = Number(String(value).replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : NaN
}

function toNumberWithConfig(value, thousandsSeparator = ',', decimalSeparator = '.') {
    if (value === null || value === undefined || value === '') return NaN
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN

    let text = String(value).trim().replace(/\s/g, '')
    if (thousandsSeparator && thousandsSeparator !== decimalSeparator) {
        text = text.split(thousandsSeparator).join('')
    }
    if (decimalSeparator && decimalSeparator !== '.') {
        text = text.split(decimalSeparator).join('.')
    }

    const parsed = Number(text)
    return Number.isFinite(parsed) ? parsed : NaN
}

function isMissing(value) {
    return value === null || value === undefined || String(value).trim() === ''
}

function percentile(sorted, p) {
    if (!sorted.length) return NaN
    const idx = (sorted.length - 1) * p
    const lower = Math.floor(idx)
    const upper = Math.ceil(idx)
    if (lower === upper) return sorted[ lower ]
    const weight = idx - lower
    return sorted[ lower ] * (1 - weight) + sorted[ upper ] * weight
}

function parseCsvInput(value) {
    return String(value || '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
}

function parseDateByFormats(value, dateFormats, dayFirst) {
    if (value === null || value === undefined || String(value).trim() === '') return null

    const text = String(value).trim()
    const supported = dateFormats
        .map((f) => String(f).trim())
        .filter(Boolean)

    for (const fmt of supported) {
        if (fmt === '%Y-%m-%d') {
            const m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
            if (m) {
                const d = new Date(`${m[ 1 ]}-${m[ 2 ]}-${m[ 3 ]}T00:00:00Z`)
                if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
            }
        }
        if (fmt === '%d/%m/%Y') {
            const m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
            if (m) {
                const d = new Date(`${m[ 3 ]}-${m[ 2 ]}-${m[ 1 ]}T00:00:00Z`)
                if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
            }
        }
        if (fmt === '%m/%d/%Y') {
            const m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
            if (m) {
                const d = new Date(`${m[ 3 ]}-${m[ 1 ]}-${m[ 2 ]}T00:00:00Z`)
                if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
            }
        }
    }

    const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (slash) {
        const day = dayFirst ? slash[ 1 ] : slash[ 2 ]
        const month = dayFirst ? slash[ 2 ] : slash[ 1 ]
        const d = new Date(`${slash[ 3 ]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00Z`)
        if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    }

    const parsed = new Date(text)
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10)
    }

    return null
}

function buildCategoryMappings(input) {
    const raw = String(input || '').trim()
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Category mappings must be a JSON object keyed by column name.')
    }
    return parsed
}

function rollingSmooth(values, method, windowSize) {
    const out = []
    const window = Math.max(2, Number(windowSize || 3))
    for (let i = 0; i < values.length; i += 1) {
        const start = Math.max(0, i - window + 1)
        const segment = values.slice(start, i + 1).filter((v) => Number.isFinite(v))
        if (!segment.length) {
            out.push(NaN)
            continue
        }
        if (method === 'rolling_median') {
            const sorted = [ ...segment ].sort((a, b) => a - b)
            out.push(percentile(sorted, 0.5))
        } else {
            out.push(segment.reduce((sum, v) => sum + v, 0) / segment.length)
        }
    }
    return out
}

function buildColumnDiff(beforeRows, afterRows, headers, maxRows = 200) {
    const before = Array.isArray(beforeRows) ? beforeRows : []
    const after = Array.isArray(afterRows) ? afterRows : []
    const cols = Array.isArray(headers) ? headers : []

    const comparedRows = Math.min(before.length, after.length, maxRows)
    const columnDiffs = cols.map((column) => {
        let changed = 0
        const samples = []

        for (let i = 0; i < comparedRows; i += 1) {
            const b = String(before[ i ]?.[ column ] ?? '')
            const a = String(after[ i ]?.[ column ] ?? '')
            if (b !== a) {
                changed += 1
                if (samples.length < 3) {
                    samples.push({ row: i + 1, before: b, after: a })
                }
            }
        }

        return {
            column,
            changed,
            samples
        }
    }).sort((x, y) => y.changed - x.changed)

    return {
        comparedRows,
        totalColumns: cols.length,
        columns: columnDiffs,
        changedColumns: columnDiffs.filter((col) => col.changed > 0)
    }
}

function DataCleaning({ dataset, setDataset }) {
    const [ config, setConfig ] = useState({
        missingStrategy: 'fill_mean',
        trimText: true,
        removeDuplicates: true,
        handleOutliers: false,
        outlierAction: 'clip',
        typeFixerEnabled: false,
        numberColumnsInput: '',
        dateColumnsInput: '',
        stringColumnsInput: '',
        dateFormatsInput: '%Y-%m-%d,%d/%m/%Y,%m/%d/%Y',
        numberThousandsSeparator: ',',
        numberDecimalSeparator: '.',
        dateDayFirst: false,
        textCleanerEnabled: false,
        textCleanColumnsInput: '',
        textLowercase: true,
        textRemovePunctuation: true,
        textRemoveStopwords: false,
        customStopwordsInput: '',
        categoryStandardizeEnabled: false,
        categoryColumnsInput: '',
        categoryCase: 'lower',
        categoryMappingsInput: '',
        noiseSmoothingEnabled: false,
        noiseSmoothingColumnsInput: '',
        noiseSmoothingMethod: 'rolling_mean',
        noiseSmoothingWindow: 3
    })
    const [ cleaning, setCleaning ] = useState(false)
    const [ downloading, setDownloading ] = useState(false)
    const [ downloadFormat, setDownloadFormat ] = useState('csv')
    const [ selectedPreset, setSelectedPreset ] = useState('')
    const [ cleanSummary, setCleanSummary ] = useState(null)
    const [ diffPreview, setDiffPreview ] = useState(null)
    const [ apiError, setApiError ] = useState(null)
    const [ expandedModules, setExpandedModules ] = useState({
        typeFixer: false,
        textCleaner: false,
        categoryStandardizer: false,
        noiseSmoothing: false
    })

    const toggleModule = (moduleKey) => {
        setExpandedModules((prev) => ({ ...prev, [ moduleKey ]: !prev[ moduleKey ] }))
    }

    const applyPreset = () => {
        if (!selectedPreset || !CLEANING_PRESETS[ selectedPreset ]) return
        const preset = CLEANING_PRESETS[ selectedPreset ]
        setConfig((prev) => ({ ...prev, ...preset.config }))
    }

    const downloadCleanedDataset = async () => {
        if (!dataset?.id) {
            setApiError('Dataset ID is missing. Please upload/clean from backend-backed dataset first.')
            return
        }

        setDownloading(true)
        setApiError(null)

        try {
            const response = await fetch(`${API_BASE_URL}/api/datasets/${dataset.id}/download?format=${downloadFormat}`)
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}))
                throw new Error(payload?.detail || 'Failed to download dataset')
            }

            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url

            const baseName = String(dataset.name || dataset.id || 'cleaned_dataset').replace(/\.[^/.]+$/, '')
            a.download = `${baseName}.${downloadFormat}`
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(url)
        } catch (err) {
            setApiError(err.message || 'Download failed')
        } finally {
            setDownloading(false)
        }
    }

    const stats = useMemo(() => {
        if (!dataset?.rows?.length) return null

        const missingCells = dataset.rows.reduce((acc, row) => {
            return acc + dataset.headers.reduce((colAcc, header) => colAcc + (isMissing(row[ header ]) ? 1 : 0), 0)
        }, 0)

        const duplicateCount = dataset.rows.length - new Set(dataset.rows.map((r) => JSON.stringify(r))).size

        const numericColumns = dataset.headers.filter((header) => {
            const values = dataset.rows.map((r) => toNumber(r[ header ])).filter((v) => !Number.isNaN(v))
            return values.length > 0 && values.length / dataset.rows.length >= 0.6
        })

        return {
            missingCells,
            duplicateCount,
            numericColumns
        }
    }, [ dataset ])

    const presetRecommendation = useMemo(() => {
        if (!dataset?.rows?.length || !dataset?.headers?.length) return null

        const sampleRows = dataset.rows.slice(0, Math.min(200, dataset.rows.length))
        const headers = dataset.headers
        const numericColumns = headers.filter((header) => {
            const values = sampleRows.map((r) => toNumber(r[ header ])).filter((v) => !Number.isNaN(v))
            return values.length > 0 && values.length / Math.max(sampleRows.length, 1) >= 0.7
        })

        const textColumns = headers.filter((header) => {
            const values = sampleRows.map((r) => r[ header ]).filter((v) => !isMissing(v))
            if (!values.length) return false
            const stringValues = values.filter((v) => typeof v === 'string')
            if (!stringValues.length) return false
            const avgLength = stringValues.reduce((sum, v) => sum + String(v).length, 0) / stringValues.length
            return avgLength >= 30
        })

        const dateLikeColumns = headers.filter((header) => /date|time|timestamp/i.test(header))

        if (textColumns.length >= 2) {
            return {
                key: 'nlp_text',
                reason: `Detected ${textColumns.length} text-heavy columns likely suited for NLP cleanup.`
            }
        }

        if (numericColumns.length >= Math.max(2, Math.floor(headers.length * 0.6)) && dataset.rowCount >= 50) {
            return {
                key: 'sensor_smoothing',
                reason: `Detected mostly numeric data (${numericColumns.length}/${headers.length} columns).`
            }
        }

        if (numericColumns.length > 0 && dateLikeColumns.length > 0) {
            return {
                key: 'business_standard',
                reason: `Detected mixed business-like schema with date and numeric fields.`
            }
        }

        return {
            key: 'quick_cleanup',
            reason: 'General-purpose cleanup is recommended for this dataset.'
        }
    }, [ dataset ])

    const applyRecommendedPreset = () => {
        if (!presetRecommendation?.key || !CLEANING_PRESETS[ presetRecommendation.key ]) return
        setSelectedPreset(presetRecommendation.key)
        setConfig((prev) => ({ ...prev, ...CLEANING_PRESETS[ presetRecommendation.key ].config }))
    }

    const applyCleaning = async () => {
        if (!dataset?.rows?.length) return
        setCleaning(true)
        setApiError(null)
        setDiffPreview(null)

        const beforeSnapshotHeaders = [ ...(dataset.headers || []) ]
        const beforeSnapshotRows = (dataset.rows || []).slice(0, 300).map((row) => ({ ...row }))

        let categoryMappings = {}
        try {
            categoryMappings = buildCategoryMappings(config.categoryMappingsInput)
        } catch (err) {
            setApiError(err.message || 'Invalid category mappings JSON.')
            setCleaning(false)
            return
        }

        const requestPayload = {
            missing_strategy: config.missingStrategy,
            trim_text: config.trimText,
            remove_duplicates: config.removeDuplicates,
            handle_outliers: config.handleOutliers,
            outlier_action: config.outlierAction,
            type_fixer_enabled: config.typeFixerEnabled,
            number_columns: parseCsvInput(config.numberColumnsInput),
            date_columns: parseCsvInput(config.dateColumnsInput),
            string_columns: parseCsvInput(config.stringColumnsInput),
            date_formats: parseCsvInput(config.dateFormatsInput),
            number_thousands_separator: config.numberThousandsSeparator || ',',
            number_decimal_separator: config.numberDecimalSeparator || '.',
            date_day_first: config.dateDayFirst,
            text_cleaner_enabled: config.textCleanerEnabled,
            text_clean_columns: parseCsvInput(config.textCleanColumnsInput),
            text_lowercase: config.textLowercase,
            text_remove_punctuation: config.textRemovePunctuation,
            text_remove_stopwords: config.textRemoveStopwords,
            custom_stopwords: parseCsvInput(config.customStopwordsInput),
            category_standardize_enabled: config.categoryStandardizeEnabled,
            category_columns: parseCsvInput(config.categoryColumnsInput),
            category_case: config.categoryCase,
            category_mappings: categoryMappings,
            noise_smoothing_enabled: config.noiseSmoothingEnabled,
            noise_smoothing_columns: parseCsvInput(config.noiseSmoothingColumnsInput),
            noise_smoothing_method: config.noiseSmoothingMethod,
            noise_smoothing_window: Number(config.noiseSmoothingWindow || 3)
        }

        // Prefer backend cleaning when dataset has an id so output is versioned and reusable.
        if (dataset.id) {
            try {
                const response = await fetch(`${API_BASE_URL}/api/datasets/${dataset.id}/clean`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestPayload)
                })

                const payload = await response.json()
                if (!response.ok) {
                    throw new Error(payload?.detail || 'Failed to clean dataset')
                }

                setDataset(payload.dataset)
                const summary = payload.clean_summary || {}
                setDiffPreview(buildColumnDiff(beforeSnapshotRows, payload.dataset?.rows || [], payload.dataset?.headers || beforeSnapshotHeaders))
                setCleanSummary({
                    rowsBefore: summary.rows_before ?? dataset.rowCount,
                    rowsAfter: summary.rows_after ?? payload.dataset.rowCount,
                    removedRows: summary.removed_rows ?? 0,
                    missingBefore: summary.missing_before ?? 0,
                    missingAfter: summary.missing_after ?? 0,
                    operations: summary.operations || {}
                })
                setCleaning(false)
                return
            } catch (err) {
                setApiError(err.message || 'Backend cleaning failed. Falling back to local cleaning.')
            }
        }

        const headers = [ ...dataset.headers ]
        let rows = dataset.rows.map((row) => ({ ...row }))

        const beforeRows = rows.length
        const beforeMissing = rows.reduce((acc, row) => {
            return acc + headers.reduce((colAcc, h) => colAcc + (isMissing(row[ h ]) ? 1 : 0), 0)
        }, 0)

        if (config.trimText) {
            rows = rows.map((row) => {
                const next = { ...row }
                headers.forEach((h) => {
                    if (typeof next[ h ] === 'string') {
                        next[ h ] = next[ h ].trim()
                    }
                })
                return next
            })
        }

        if (config.typeFixerEnabled) {
            const numberColumns = parseCsvInput(config.numberColumnsInput)
            const dateColumns = parseCsvInput(config.dateColumnsInput)
            const stringColumns = parseCsvInput(config.stringColumnsInput)
            const dateFormats = parseCsvInput(config.dateFormatsInput)

            const objectLikeColumns = headers.filter((h) => {
                const sample = rows.find((r) => !isMissing(r[ h ]))?.[ h ]
                return typeof sample === 'string'
            })

            const numberTargets = numberColumns.length ? numberColumns : objectLikeColumns
            const dateTargets = dateColumns.length
                ? dateColumns
                : headers.filter((h) => /date|time|timestamp/i.test(h))
            const stringTargets = stringColumns.length ? stringColumns : objectLikeColumns

            rows = rows.map((row) => {
                const next = { ...row }

                numberTargets.forEach((col) => {
                    if (!(col in next)) return
                    const parsed = toNumberWithConfig(
                        next[ col ],
                        config.numberThousandsSeparator,
                        config.numberDecimalSeparator
                    )
                    if (!Number.isNaN(parsed)) next[ col ] = parsed
                })

                dateTargets.forEach((col) => {
                    if (!(col in next)) return
                    const parsed = parseDateByFormats(next[ col ], dateFormats, config.dateDayFirst)
                    if (parsed) next[ col ] = parsed
                })

                stringTargets.forEach((col) => {
                    if (!(col in next) || isMissing(next[ col ])) return
                    next[ col ] = String(next[ col ])
                })

                return next
            })
        }

        if (config.textCleanerEnabled) {
            const textColumns = parseCsvInput(config.textCleanColumnsInput)
            const customStopwords = new Set(parseCsvInput(config.customStopwordsInput).map((s) => s.toLowerCase()))
            const stopwords = new Set([ ...DEFAULT_STOPWORDS, ...customStopwords ])
            const targets = textColumns.length ? textColumns : headers

            rows = rows.map((row) => {
                const next = { ...row }
                targets.forEach((col) => {
                    if (!(col in next) || isMissing(next[ col ])) return
                    let value = String(next[ col ])
                    if (config.textLowercase) value = value.toLowerCase()
                    if (config.textRemovePunctuation) value = value.replace(/[^\w\s]/g, ' ')
                    if (config.textRemoveStopwords) {
                        value = value
                            .split(/\s+/)
                            .filter((token) => token && !stopwords.has(token.toLowerCase()))
                            .join(' ')
                    }
                    next[ col ] = value.replace(/\s+/g, ' ').trim()
                })
                return next
            })
        }

        if (config.categoryStandardizeEnabled) {
            const targets = parseCsvInput(config.categoryColumnsInput)
            const mappedColumns = targets.length ? targets : headers

            rows = rows.map((row) => {
                const next = { ...row }
                mappedColumns.forEach((col) => {
                    if (!(col in next) || isMissing(next[ col ])) return
                    let value = String(next[ col ]).trim()
                    const colMapping = categoryMappings[ col ] || {}
                    const mapped = colMapping[ value ] ?? colMapping[ value.toLowerCase() ]
                    if (mapped !== undefined) value = String(mapped)

                    if (config.categoryCase === 'lower') value = value.toLowerCase()
                    if (config.categoryCase === 'upper') value = value.toUpperCase()
                    if (config.categoryCase === 'title') value = value.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

                    next[ col ] = value
                })
                return next
            })
        }

        // Missing value handling
        if (config.missingStrategy === 'drop_rows') {
            rows = rows.filter((row) => headers.every((h) => !isMissing(row[ h ])))
        } else {
            const fillValues = {}
            headers.forEach((h) => {
                const values = rows.map((r) => r[ h ]).filter((v) => !isMissing(v))
                const numericValues = values.map((v) => toNumber(v)).filter((v) => !Number.isNaN(v))

                if (config.missingStrategy === 'fill_zero') {
                    fillValues[ h ] = numericValues.length ? 0 : 'Unknown'
                } else if (config.missingStrategy === 'fill_mean' && numericValues.length) {
                    fillValues[ h ] = numericValues.reduce((a, b) => a + b, 0) / numericValues.length
                } else if (config.missingStrategy === 'fill_median' && numericValues.length) {
                    const sorted = [ ...numericValues ].sort((a, b) => a - b)
                    fillValues[ h ] = percentile(sorted, 0.5)
                } else {
                    const freq = {}
                    values.forEach((v) => {
                        const key = String(v)
                        freq[ key ] = (freq[ key ] || 0) + 1
                    })
                    const modeEntry = Object.entries(freq).sort((a, b) => b[ 1 ] - a[ 1 ])[ 0 ]
                    fillValues[ h ] = modeEntry ? modeEntry[ 0 ] : 'Unknown'
                }
            })

            rows = rows.map((row) => {
                const next = { ...row }
                headers.forEach((h) => {
                    if (isMissing(next[ h ])) {
                        next[ h ] = fillValues[ h ]
                    }
                })
                return next
            })
        }

        if (config.removeDuplicates) {
            const seen = new Set()
            rows = rows.filter((row) => {
                const key = JSON.stringify(row)
                if (seen.has(key)) return false
                seen.add(key)
                return true
            })
        }

        if (config.handleOutliers) {
            const numericHeaders = headers.filter((h) => {
                const values = rows.map((r) => toNumber(r[ h ])).filter((v) => !Number.isNaN(v))
                return values.length > 0 && values.length / rows.length >= 0.6
            })

            const bounds = {}
            numericHeaders.forEach((h) => {
                const values = rows.map((r) => toNumber(r[ h ])).filter((v) => !Number.isNaN(v)).sort((a, b) => a - b)
                const q1 = percentile(values, 0.25)
                const q3 = percentile(values, 0.75)
                const iqr = q3 - q1
                bounds[ h ] = {
                    low: q1 - 1.5 * iqr,
                    high: q3 + 1.5 * iqr
                }
            })

            if (config.outlierAction === 'remove') {
                rows = rows.filter((row) => {
                    return numericHeaders.every((h) => {
                        const val = toNumber(row[ h ])
                        if (Number.isNaN(val)) return true
                        return val >= bounds[ h ].low && val <= bounds[ h ].high
                    })
                })
            } else {
                rows = rows.map((row) => {
                    const next = { ...row }
                    numericHeaders.forEach((h) => {
                        const val = toNumber(next[ h ])
                        if (Number.isNaN(val)) return
                        if (val < bounds[ h ].low) next[ h ] = bounds[ h ].low
                        if (val > bounds[ h ].high) next[ h ] = bounds[ h ].high
                    })
                    return next
                })
            }
        }

        if (config.noiseSmoothingEnabled) {
            const targets = parseCsvInput(config.noiseSmoothingColumnsInput)
            const numericTargets = targets.length
                ? targets
                : headers.filter((h) => rows.some((r) => !Number.isNaN(toNumber(r[ h ]))))

            numericTargets.forEach((col) => {
                if (!headers.includes(col)) return
                const values = rows.map((row) => toNumber(row[ col ]))
                const smoothed = rollingSmooth(values, config.noiseSmoothingMethod, config.noiseSmoothingWindow)
                rows = rows.map((row, idx) => {
                    if (Number.isNaN(smoothed[ idx ])) return row
                    return { ...row, [ col ]: smoothed[ idx ] }
                })
            })
        }

        const afterMissing = rows.reduce((acc, row) => {
            return acc + headers.reduce((colAcc, h) => colAcc + (isMissing(row[ h ]) ? 1 : 0), 0)
        }, 0)

        const updated = {
            ...dataset,
            name: dataset.name?.includes('_cleaned') ? dataset.name : `${dataset.name}_cleaned`,
            rows,
            rowCount: rows.length,
            colCount: headers.length
        }

        setDataset(updated)
        setDiffPreview(buildColumnDiff(beforeSnapshotRows, rows, headers))
        setCleanSummary({
            rowsBefore: beforeRows,
            rowsAfter: rows.length,
            removedRows: beforeRows - rows.length,
            missingBefore: beforeMissing,
            missingAfter: afterMissing,
            operations: {
                type_fixer: { enabled: config.typeFixerEnabled },
                text_cleaner: { enabled: config.textCleanerEnabled },
                category_standardization: { enabled: config.categoryStandardizeEnabled },
                noise_smoothing: { enabled: config.noiseSmoothingEnabled }
            }
        })

        // Local fallback succeeded, so clear any prior backend-fallback notice.
        setApiError(null)

        setCleaning(false)
    }

    if (!dataset) {
        return (
            <div className="card py-16 text-center">
                <Sparkles size={64} className="mx-auto mb-4 text-slate-300" />
                <h2 className="mb-2 text-2xl font-bold text-slate-800">No Dataset Loaded</h2>
                <p className="text-slate-500">Upload a dataset first, then come here to clean it.</p>
            </div>
        )
    }

    return (
        <div className="space-y-6 fade-up">
            <div className="card hero-contrast bg-gradient-to-r from-blue-800 via-teal-700 to-orange-600 text-white">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h1 className="title-display mb-1 text-2xl font-bold">Data Cleaning</h1>
                        <p className="text-cyan-100">Prepare data quality before EDA and ML training</p>
                    </div>
                    <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3 lg:w-auto lg:min-w-[560px]">
                        <select
                            value={downloadFormat}
                            onChange={(e) => setDownloadFormat(e.target.value)}
                            className="input-field min-h-0 border-white/45 bg-white/15 px-3 py-3 text-sm font-medium text-white"
                            aria-label="Download format"
                        >
                            <option value="csv" className="text-slate-900">CSV</option>
                            <option value="json" className="text-slate-900">JSON</option>
                        </select>
                        <button
                            onClick={downloadCleanedDataset}
                            disabled={downloading || !dataset?.id}
                            className="btn-secondary flex w-full items-center justify-center gap-2 border-white/45 bg-white/15 px-4 py-3 text-white hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <Download size={18} />
                            {downloading ? 'Downloading...' : `Download ${downloadFormat.toUpperCase()}`}
                        </button>
                        <button
                            onClick={applyCleaning}
                            disabled={cleaning}
                            className="btn-secondary flex w-full items-center justify-center gap-2 border-white/45 bg-white px-6 py-3 text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                        >
                            <Wand2 size={18} />
                            {cleaning ? 'Cleaning...' : 'Apply Cleaning'}
                        </button>
                    </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3 text-sm">
                    <span className="chip-soft">{dataset.name}</span>
                    <span>{dataset.rowCount} rows</span>
                    <span>{dataset.colCount} columns</span>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="card lg:col-span-2">
                    <h3 className="section-title mb-4 flex items-center gap-2 text-slate-900">
                        <SlidersHorizontal size={18} /> Cleaning Rules
                    </h3>

                    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="mb-2 text-sm font-medium text-slate-700">Preset Profiles</p>
                        {presetRecommendation && (
                            <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm text-blue-900">
                                        Recommended: <span className="font-semibold">{CLEANING_PRESETS[ presetRecommendation.key ]?.label}</span>
                                    </p>
                                    <button
                                        type="button"
                                        onClick={applyRecommendedPreset}
                                        className="btn-secondary rounded-lg border-blue-300 px-3 py-1.5 text-xs text-blue-800 hover:bg-blue-100"
                                    >
                                        Apply Recommended
                                    </button>
                                </div>
                                <p className="mt-1 text-xs text-blue-800">{presetRecommendation.reason}</p>
                            </div>
                        )}
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                            <select
                                className="input-field lg:col-span-2"
                                value={selectedPreset}
                                onChange={(e) => setSelectedPreset(e.target.value)}
                            >
                                <option value="">Select a preset...</option>
                                {Object.entries(CLEANING_PRESETS).map(([ key, preset ]) => (
                                    <option key={key} value={key}>{preset.label}</option>
                                ))}
                            </select>
                            <button
                                type="button"
                                onClick={applyPreset}
                                disabled={!selectedPreset}
                                className="btn-secondary rounded-lg border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                Apply Preset
                            </button>
                            <div className="text-xs text-slate-500 lg:col-span-1">
                                {selectedPreset && CLEANING_PRESETS[ selectedPreset ]
                                    ? CLEANING_PRESETS[ selectedPreset ].description
                                    : 'Pick a profile to auto-fill common settings.'}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <div>
                            <label className="mb-2 block text-sm font-medium text-slate-700">Missing Value Strategy</label>
                            <select
                                className="input-field"
                                value={config.missingStrategy}
                                onChange={(e) => setConfig((prev) => ({ ...prev, missingStrategy: e.target.value }))}
                            >
                                <option value="fill_mean">Fill numeric with mean, text with mode</option>
                                <option value="fill_median">Fill numeric with median, text with mode</option>
                                <option value="fill_mode">Fill all with mode</option>
                                <option value="fill_zero">Fill numeric with 0, text with Unknown</option>
                                <option value="drop_rows">Drop rows with missing values</option>
                            </select>
                        </div>

                        <div>
                            <label className="mb-2 block text-sm font-medium text-slate-700">Outlier Handling</label>
                            <div className="rounded-xl border border-slate-200 bg-white p-3">
                                <label className="flex items-center gap-2 text-sm text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={config.handleOutliers}
                                        onChange={(e) => setConfig((prev) => ({ ...prev, handleOutliers: e.target.checked }))}
                                    />
                                    Enable outlier handling (IQR)
                                </label>
                                {config.handleOutliers && (
                                    <select
                                        className="input-field mt-3"
                                        value={config.outlierAction}
                                        onChange={(e) => setConfig((prev) => ({ ...prev, outlierAction: e.target.value }))}
                                    >
                                        <option value="clip">Clip outliers to bounds</option>
                                        <option value="remove">Remove rows with outliers</option>
                                    </select>
                                )}
                            </div>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <label className="flex items-center gap-2 text-sm text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={config.removeDuplicates}
                                    onChange={(e) => setConfig((prev) => ({ ...prev, removeDuplicates: e.target.checked }))}
                                />
                                Remove duplicate rows
                            </label>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <label className="flex items-center gap-2 text-sm text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={config.trimText}
                                    onChange={(e) => setConfig((prev) => ({ ...prev, trimText: e.target.checked }))}
                                />
                                Trim whitespace in text columns
                            </label>
                        </div>

                        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4">
                            <div className="mb-3 flex items-center justify-between gap-2">
                                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={config.typeFixerEnabled}
                                        onChange={(e) => {
                                            const checked = e.target.checked
                                            setConfig((prev) => ({ ...prev, typeFixerEnabled: checked }))
                                            if (checked) {
                                                setExpandedModules((prev) => ({ ...prev, typeFixer: true }))
                                            }
                                        }}
                                    />
                                    Type Fixer (number/date/string coercion)
                                </label>
                                <button
                                    type="button"
                                    onClick={() => toggleModule('typeFixer')}
                                    className="btn-secondary px-3 py-1.5 text-xs"
                                >
                                    <span className="inline-flex items-center gap-1">
                                        {expandedModules.typeFixer ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        {expandedModules.typeFixer ? 'Hide options' : 'Show options'}
                                    </span>
                                </button>
                            </div>
                            {config.typeFixerEnabled && expandedModules.typeFixer && (
                                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                    <div>
                                        <label className="mb-1 block text-xs font-medium text-slate-600">Number Columns (comma separated, blank=auto)</label>
                                        <input
                                            className="input-field"
                                            value={config.numberColumnsInput}
                                            onChange={(e) => setConfig((prev) => ({ ...prev, numberColumnsInput: e.target.value }))}
                                            placeholder="price, amount, revenue"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-medium text-slate-600">Date Columns (comma separated, blank=detect by name)</label>
                                        <input
                                            className="input-field"
                                            value={config.dateColumnsInput}
                                            onChange={(e) => setConfig((prev) => ({ ...prev, dateColumnsInput: e.target.value }))}
                                            placeholder="order_date, signup_time"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-medium text-slate-600">String Columns (comma separated, blank=auto)</label>
                                        <input
                                            className="input-field"
                                            value={config.stringColumnsInput}
                                            onChange={(e) => setConfig((prev) => ({ ...prev, stringColumnsInput: e.target.value }))}
                                            placeholder="name, city"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-medium text-slate-600">Date Formats (Python style, comma separated)</label>
                                        <input
                                            className="input-field"
                                            value={config.dateFormatsInput}
                                            onChange={(e) => setConfig((prev) => ({ ...prev, dateFormatsInput: e.target.value }))}
                                            placeholder="%Y-%m-%d,%d/%m/%Y"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-medium text-slate-600">Thousands Separator</label>
                                        <input
                                            className="input-field"
                                            value={config.numberThousandsSeparator}
                                            onChange={(e) => setConfig((prev) => ({ ...prev, numberThousandsSeparator: e.target.value }))}
                                            placeholder=","
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-medium text-slate-600">Decimal Separator</label>
                                        <input
                                            className="input-field"
                                            value={config.numberDecimalSeparator}
                                            onChange={(e) => setConfig((prev) => ({ ...prev, numberDecimalSeparator: e.target.value }))}
                                            placeholder="."
                                        />
                                    </div>
                                    <label className="flex items-center gap-2 text-sm text-slate-700 lg:col-span-2">
                                        <input
                                            type="checkbox"
                                            checked={config.dateDayFirst}
                                            onChange={(e) => setConfig((prev) => ({ ...prev, dateDayFirst: e.target.checked }))}
                                        />
                                        Parse day first for ambiguous dates (DD/MM/YYYY)
                                    </label>
                                </div>
                            )}
                        </div>

                        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4">
                            <div className="mb-3 flex items-center justify-between gap-2">
                                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={config.textCleanerEnabled}
                                        onChange={(e) => {
                                            const checked = e.target.checked
                                            setConfig((prev) => ({ ...prev, textCleanerEnabled: checked }))
                                            if (checked) {
                                                setExpandedModules((prev) => ({ ...prev, textCleaner: true }))
                                            }
                                        }}
                                    />
                                    Text Cleaner (lowercase, punctuation, stopwords)
                                </label>
                                <button
                                    type="button"
                                    onClick={() => toggleModule('textCleaner')}
                                    className="btn-secondary px-3 py-1.5 text-xs"
                                >
                                    <span className="inline-flex items-center gap-1">
                                        {expandedModules.textCleaner ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        {expandedModules.textCleaner ? 'Hide options' : 'Show options'}
                                    </span>
                                </button>
                            </div>
                            {config.textCleanerEnabled && expandedModules.textCleaner && (
                                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                    <div className="lg:col-span-2">
                                        <label className="mb-1 block text-xs font-medium text-slate-600">Text Columns (comma separated, blank=all)</label>
                                        <input
                                            className="input-field"
                                            value={config.textCleanColumnsInput}
                                            onChange={(e) => setConfig((prev) => ({ ...prev, textCleanColumnsInput: e.target.value }))}
                                            placeholder="review, comments, feedback"
                                        />
                                    </div>
                                    <label className="flex items-center gap-2 text-sm text-slate-700">
                                        <input
                                            type="checkbox"
                                            checked={config.textLowercase}
                                            onChange={(e) => setConfig((prev) => ({ ...prev, textLowercase: e.target.checked }))}
                                        />
                                        Lowercase text
                                    </label>
                                    <label className="flex items-center gap-2 text-sm text-slate-700">
                                        <input
                                            type="checkbox"
                                            checked={config.textRemovePunctuation}
                                            onChange={(e) => setConfig((prev) => ({ ...prev, textRemovePunctuation: e.target.checked }))}
                                        />
                                        Remove punctuation
                                    </label>
                                    <label className="flex items-center gap-2 text-sm text-slate-700 lg:col-span-2">
                                        <input
                                            type="checkbox"
                                            checked={config.textRemoveStopwords}
                                            onChange={(e) => setConfig((prev) => ({ ...prev, textRemoveStopwords: e.target.checked }))}
                                        />
                                        Remove stopwords
                                    </label>
                                    {config.textRemoveStopwords && (
                                        <div className="lg:col-span-2">
                                            <label className="mb-1 block text-xs font-medium text-slate-600">Custom Stopwords (comma separated)</label>
                                            <input
                                                className="input-field"
                                                value={config.customStopwordsInput}
                                                onChange={(e) => setConfig((prev) => ({ ...prev, customStopwordsInput: e.target.value }))}
                                                placeholder="please, hello, thanks"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4">
                            <div className="mb-3 flex items-center justify-between gap-2">
                                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={config.categoryStandardizeEnabled}
                                        onChange={(e) => {
                                            const checked = e.target.checked
                                            setConfig((prev) => ({ ...prev, categoryStandardizeEnabled: checked }))
                                            if (checked) {
                                                setExpandedModules((prev) => ({ ...prev, categoryStandardizer: true }))
                                            }
                                        }}
                                    />
                                    Category Standardizer (case + mapping rules)
                                </label>
                                <button
                                    type="button"
                                    onClick={() => toggleModule('categoryStandardizer')}
                                    className="btn-secondary px-3 py-1.5 text-xs"
                                >
                                    <span className="inline-flex items-center gap-1">
                                        {expandedModules.categoryStandardizer ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        {expandedModules.categoryStandardizer ? 'Hide options' : 'Show options'}
                                    </span>
                                </button>
                            </div>
                            {config.categoryStandardizeEnabled && expandedModules.categoryStandardizer && (
                                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                    <div>
                                        <label className="mb-1 block text-xs font-medium text-slate-600">Category Columns (comma separated, blank=all text)</label>
                                        <input
                                            className="input-field"
                                            value={config.categoryColumnsInput}
                                            onChange={(e) => setConfig((prev) => ({ ...prev, categoryColumnsInput: e.target.value }))}
                                            placeholder="gender, city, status"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-medium text-slate-600">Case Normalization</label>
                                        <select
                                            className="input-field"
                                            value={config.categoryCase}
                                            onChange={(e) => setConfig((prev) => ({ ...prev, categoryCase: e.target.value }))}
                                        >
                                            <option value="lower">lowercase</option>
                                            <option value="upper">UPPERCASE</option>
                                            <option value="title">Title Case</option>
                                            <option value="none">No case change</option>
                                        </select>
                                    </div>
                                    <div className="lg:col-span-2">
                                        <label className="mb-1 block text-xs font-medium text-slate-600">Mapping Rules JSON (optional)</label>
                                        <textarea
                                            className="input-field min-h-28"
                                            value={config.categoryMappingsInput}
                                            onChange={(e) => setConfig((prev) => ({ ...prev, categoryMappingsInput: e.target.value }))}
                                            placeholder='{"gender": {"m": "Male", "male": "Male", "f": "Female"}}'
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4">
                            <div className="mb-3 flex items-center justify-between gap-2">
                                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={config.noiseSmoothingEnabled}
                                        onChange={(e) => {
                                            const checked = e.target.checked
                                            setConfig((prev) => ({ ...prev, noiseSmoothingEnabled: checked }))
                                            if (checked) {
                                                setExpandedModules((prev) => ({ ...prev, noiseSmoothing: true }))
                                            }
                                        }}
                                    />
                                    Noise Smoothing (rolling mean/median)
                                </label>
                                <button
                                    type="button"
                                    onClick={() => toggleModule('noiseSmoothing')}
                                    className="btn-secondary px-3 py-1.5 text-xs"
                                >
                                    <span className="inline-flex items-center gap-1">
                                        {expandedModules.noiseSmoothing ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        {expandedModules.noiseSmoothing ? 'Hide options' : 'Show options'}
                                    </span>
                                </button>
                            </div>
                            {config.noiseSmoothingEnabled && expandedModules.noiseSmoothing && (
                                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                                    <div className="lg:col-span-2">
                                        <label className="mb-1 block text-xs font-medium text-slate-600">Numeric Columns (comma separated, blank=all numeric)</label>
                                        <input
                                            className="input-field"
                                            value={config.noiseSmoothingColumnsInput}
                                            onChange={(e) => setConfig((prev) => ({ ...prev, noiseSmoothingColumnsInput: e.target.value }))}
                                            placeholder="sales, signal, temperature"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-medium text-slate-600">Method</label>
                                        <select
                                            className="input-field"
                                            value={config.noiseSmoothingMethod}
                                            onChange={(e) => setConfig((prev) => ({ ...prev, noiseSmoothingMethod: e.target.value }))}
                                        >
                                            <option value="rolling_mean">Rolling Mean</option>
                                            <option value="rolling_median">Rolling Median</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-medium text-slate-600">Window Size</label>
                                        <input
                                            type="number"
                                            min="2"
                                            className="input-field"
                                            value={config.noiseSmoothingWindow}
                                            onChange={(e) => setConfig((prev) => ({ ...prev, noiseSmoothingWindow: Number(e.target.value || 3) }))}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="card">
                    <h3 className="section-title mb-4 text-slate-900">Current Data Health</h3>
                    {stats ? (
                        <div className="space-y-3 text-sm">
                            <div className="rounded-lg bg-slate-50 p-3">
                                <p className="text-slate-500">Rows</p>
                                <p className="text-xl font-bold text-slate-800">{dataset.rowCount}</p>
                            </div>
                            <div className="rounded-lg bg-slate-50 p-3">
                                <p className="text-slate-500">Missing Cells</p>
                                <p className="text-xl font-bold text-orange-600">{stats.missingCells}</p>
                            </div>
                            <div className="rounded-lg bg-slate-50 p-3">
                                <p className="text-slate-500">Duplicate Rows</p>
                                <p className="text-xl font-bold text-red-600">{stats.duplicateCount}</p>
                            </div>
                            <div className="rounded-lg bg-slate-50 p-3">
                                <p className="text-slate-500">Numeric Columns</p>
                                <p className="text-xl font-bold text-blue-700">{stats.numericColumns.length}</p>
                            </div>
                        </div>
                    ) : (
                        <p className="text-slate-500">No stats available.</p>
                    )}
                </div>
            </div>

            {cleanSummary && (
                <div className="card border border-emerald-200 bg-emerald-50/80">
                    <div className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 text-emerald-600" size={20} />
                        <div>
                            <h3 className="text-lg font-semibold text-emerald-900">Cleaning Applied</h3>
                            <p className="mt-1 text-sm text-emerald-800">
                                Rows: {cleanSummary.rowsBefore} → {cleanSummary.rowsAfter} (removed {cleanSummary.removedRows})
                            </p>
                            <p className="text-sm text-emerald-800">
                                Missing cells: {cleanSummary.missingBefore} → {cleanSummary.missingAfter}
                            </p>
                            {cleanSummary.operations && (
                                <p className="mt-1 text-sm text-emerald-800">
                                    Advanced ops: Type Fixer {cleanSummary.operations.type_fixer?.enabled ? 'on' : 'off'},
                                    {' '}Text Cleaner {cleanSummary.operations.text_cleaner?.enabled ? 'on' : 'off'},
                                    {' '}Category Standardizer {cleanSummary.operations.category_standardization?.enabled ? 'on' : 'off'},
                                    {' '}Noise Smoothing {cleanSummary.operations.noise_smoothing?.enabled ? 'on' : 'off'}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {apiError && (
                <div className="card border border-amber-200 bg-amber-50/80">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="mt-0.5 text-amber-600" size={20} />
                        <div>
                            <h3 className="text-lg font-semibold text-amber-900">Backend Cleaning Notice</h3>
                            <p className="mt-1 text-sm text-amber-800">{apiError}</p>
                        </div>
                    </div>
                </div>
            )}

            {diffPreview && (
                <div className="card border border-blue-200 bg-blue-50/70">
                    <h3 className="mb-2 text-lg font-semibold text-blue-900">Column Diff Preview</h3>
                    <p className="mb-3 text-sm text-blue-800">
                        Compared first {diffPreview.comparedRows} aligned rows across {diffPreview.totalColumns} columns.
                    </p>
                    {diffPreview.changedColumns.length > 0 ? (
                        <div className="space-y-2">
                            {diffPreview.changedColumns.slice(0, 8).map((item) => (
                                <div key={item.column} className="rounded-lg border border-blue-200 bg-white p-3">
                                    <p className="text-sm font-semibold text-blue-900">
                                        {item.column}: {item.changed} cell change{item.changed === 1 ? '' : 's'}
                                    </p>
                                    {item.samples.length > 0 && (
                                        <div className="mt-1 space-y-1 text-xs text-slate-600">
                                            {item.samples.map((sample, idx) => (
                                                <p key={`${item.column}-${idx}`}>
                                                    Row {sample.row}: "{sample.before}" {'->'} "{sample.after}"
                                                </p>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-blue-800">No cell-level value changes were detected in compared rows.</p>
                    )}
                </div>
            )}

            <div className="card">
                <div className="mb-3 flex items-center gap-2 text-slate-700">
                    <AlertCircle size={16} />
                    <p className="text-sm">Preview first 10 rows of cleaned dataset state</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50">
                                {dataset.headers.map((header, i) => (
                                    <th key={i} className="border-b px-4 py-2 text-left font-semibold text-slate-700">
                                        {header}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {dataset.rows.slice(0, 10).map((row, i) => (
                                <tr key={i} className="hover:bg-slate-50">
                                    {dataset.headers.map((header, j) => (
                                        <td key={j} className="border-b px-4 py-2 text-slate-600">
                                            {String(row[ header ] ?? '')}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

export default DataCleaning
