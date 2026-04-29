/**
 * API Service Layer
 * Centralized API communication with backend
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || '';
const API_V1 = `${API_BASE_URL}/api`;
const API_KEY = import.meta.env.VITE_API_KEY || 'dev-local-9f4e1d2c7a8b3f6e';

function resolveTenantId() {
    if (typeof window === 'undefined') return import.meta.env.VITE_TENANT_ID || null

    const envTenant = import.meta.env.VITE_TENANT_ID
    if (envTenant) return envTenant

    const existing = window.localStorage.getItem('tenant_id')
    if (existing) return existing

    const generated = window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `tenant-${Date.now()}-${Math.random().toString(16).slice(2)}`
    window.localStorage.setItem('tenant_id', generated)
    return generated
}

const TENANT_ID = resolveTenantId();

// Remove console.log in production
if (import.meta.env.DEV) {
    console.log('API Base URL:', API_BASE_URL)
}

/**
 * Helper to get standardized headers for all API requests
 * @param {Object} extraHeaders Additional headers to merge
 * @returns {Object} Headers object
 */
const getHeaders = (extraHeaders = {}) => ({
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
    'X-Tenant-Id': TENANT_ID,
    ...extraHeaders
});

// Safe JSON parse — returns {} if body is not valid JSON (e.g. 500 HTML page)
async function safeJson(response) {
    try {
        return await response.json()
    } catch (_) {
        return {}
    }
}

// Throw with backend detail message if available
async function throwIfNotOk(response, fallback = 'Request failed') {
    if (!response.ok) {
        const body = await safeJson(response)
        throw new Error(body?.detail || body?.message || `${fallback} (${response.status})`)
    }
    return response
}

// ==================== Session Management ====================

export const sessionAPI = {
    async createSession(userId = null) {
        const response = await fetch(`${API_V1}/sessions`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ user_id: userId })
        });
        await throwIfNotOk(response, 'Failed to create session')
        return safeJson(response)
    },

    async getSessionHistory(sessionId) {
        const response = await fetch(`${API_V1}/sessions/${sessionId}/history`, {
            headers: getHeaders()
        });
        await throwIfNotOk(response, 'Failed to fetch session history')
        return safeJson(response)
    }
};

// ==================== Dataset Management ====================

export const datasetAPI = {
    async searchDatasets(query, page = 1, limit = 10) {
        const response = await fetch(`${API_V1}/datasets/search`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ query, page, limit })
        });
        await throwIfNotOk(response, 'Failed to search datasets')
        return safeJson(response)
    },

    async getDataset(datasetId) {
        const response = await fetch(`${API_V1}/datasets/${datasetId}`, {
            headers: getHeaders()
        });
        await throwIfNotOk(response, 'Failed to fetch dataset')
        return safeJson(response)
    },

    async listDatasets() {
        const response = await fetch(`${API_V1}/datasets`, {
            headers: getHeaders()
        });
        await throwIfNotOk(response, 'Failed to fetch datasets')
        return safeJson(response)
    },

    async uploadDataset(file) {
        // Validate file size client-side (50 MB limit)
        const MAX_MB = 50
        if (file.size > MAX_MB * 1024 * 1024) {
            throw new Error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is ${MAX_MB} MB.`)
        }
        const formData = new FormData()
        formData.append('file', file)
        const response = await fetch(`${API_V1}/datasets/upload`, {
            method: 'POST',
            headers: {
                'X-API-Key': API_KEY,
                'X-Tenant-Id': TENANT_ID
            },
            body: formData
        })
        if (!response.ok) {
            // Surface the real backend error message
            let detail = 'Failed to upload dataset'
            try {
                const err = await response.json()
                detail = err.detail || err.message || detail
            } catch (_) { }
            throw new Error(detail)
        }
        return response.json()
    },

    async deleteDataset(datasetId) {
        const response = await fetch(`${API_V1}/datasets/${datasetId}`, {
            method: 'DELETE',
            headers: getHeaders()
        });
        await throwIfNotOk(response, 'Failed to delete dataset')
        return safeJson(response)
    },

    async getDatasetPreview(datasetId, rows = 10) {
        const response = await fetch(`${API_V1}/datasets/${datasetId}/preview?rows=${rows}`, {
            headers: getHeaders()
        });
        await throwIfNotOk(response, 'Failed to fetch dataset preview')
        return safeJson(response)
    },

    async cleanDataset(datasetId, cleaningRequest) {
        const response = await fetch(`${API_V1}/datasets/${datasetId}/clean`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(cleaningRequest)
        });
        await throwIfNotOk(response, 'Failed to clean dataset')
        return safeJson(response)
    },

    async featureEngineerDataset(datasetId, request) {
        const response = await fetch(`${API_V1}/datasets/${datasetId}/feature-engineer`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(request)
        });
        await throwIfNotOk(response, 'Failed to save engineered dataset')
        return safeJson(response)
    },

    async downloadDataset(datasetId, format = 'csv') {
        const response = await fetch(`${API_V1}/datasets/${datasetId}/download?format=${format}`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to download dataset');
        return response.blob();
    }
};

// ==================== Statistics & Math ====================

export const statisticsAPI = {
    async analyze(datasetId, params = {}) {
        const response = await fetch(`${API_V1}/statistics-math/analyze`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ dataset_id: datasetId, ...params })
        });
        await throwIfNotOk(response, 'Failed to run statistical analysis')
        return safeJson(response)
    }
};

// ==================== Query & Analysis ====================

export const queryAPI = {
    async submitQuery(sessionId, query, datasetId = null) {
        const response = await fetch(`${API_V1}/query`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ session_id: sessionId, query, dataset_id: datasetId })
        });
        await throwIfNotOk(response, 'Failed to submit query')
        return safeJson(response)
    },

    async enhancedQuery(sessionId, query, datasetId, autoEda = true, autoMl = false) {
        const response = await fetch(`${API_V1}/query/enhanced`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ session_id: sessionId, query, dataset_id: datasetId, auto_eda: autoEda, auto_ml: autoMl })
        });
        await throwIfNotOk(response, 'Failed to process enhanced query')
        return safeJson(response)
    },

    async langchainQuery(sessionId, query, datasetId = null) {
        const response = await fetch(`${API_V1}/query/langchain`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ session_id: sessionId, query, dataset_id: datasetId })
        });
        await throwIfNotOk(response, 'Failed to process langchain query')
        return safeJson(response)
    }
};

// ==================== EDA (Exploratory Data Analysis) ====================

export const edaAPI = {
    async analyzeDataset(datasetId, sessionId) {
        const response = await fetch(`${API_V1}/analysis/auto`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                session_id: sessionId,
                dataset_id: datasetId,
                analysis_type: 'eda'
            })
        });
        if (!response.ok) {
            let detail = 'Failed to analyze dataset'
            try { const err = await response.json(); detail = err.detail || detail } catch (_) { }
            throw new Error(detail)
        }
        return response.json();
    },

    async runStatisticalTests(datasetId, column1, column2 = null) {
        const params = new URLSearchParams({ dataset_id: datasetId, column1 })
        if (column2) params.append('column2', column2)
        const response = await fetch(`${API_V1}/eda/statistical-tests?${params}`, {
            method: 'POST',
            headers: getHeaders()
        });
        await throwIfNotOk(response, 'Failed to run statistical tests')
        return safeJson(response)
    }
};

// ==================== Machine Learning ====================

export const mlAPI = {
    async trainModel(datasetId, sessionId, targetColumn, modelType = 'auto') {
        const response = await fetch(`${API_V1}/analysis/auto`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ session_id: sessionId, dataset_id: datasetId, analysis_type: 'ml', target_column: targetColumn, model_type: modelType })
        });
        await throwIfNotOk(response, 'Failed to train model')
        return safeJson(response)
    },

    async getFeatureImportance(modelId) {
        const response = await fetch(`${API_V1}/explain/feature-importance?model_id=${encodeURIComponent(modelId)}`, {
            method: 'POST',
            headers: getHeaders()
        });
        await throwIfNotOk(response, 'Failed to fetch feature importance')
        return safeJson(response)
    },

    async predictWithModel(datasetId, modelId, data) {
        const response = await fetch(`${API_V1}/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataset_id: datasetId, model_id: modelId, data })
        });
        await throwIfNotOk(response, 'Failed to make prediction')
        return safeJson(response)
    }
};

// ==================== AI Chat ====================

export const chatAPI = {
    async sendMessage(message, datasetId = null, sessionId = null) {
        const response = await fetch(`${API_V1}/chat`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ message, dataset_id: datasetId, session_id: sessionId })
        });
        await throwIfNotOk(response, 'Failed to send message')
        return safeJson(response)
    },

    async getChatHistory(sessionId) {
        const response = await fetch(`${API_V1}/chat/history/${sessionId}`, {
            headers: getHeaders()
        });
        await throwIfNotOk(response, 'Failed to fetch chat history')
        return safeJson(response)
    }
};

// ==================== Report Generation ====================

export const reportAPI = {
    async generateReport(datasetId, type = 'pdf', sessionId = null) {
        const params = new URLSearchParams({ dataset_id: datasetId, type })
        if (sessionId) params.append('session_id', sessionId)
        const response = await fetch(`${API_V1}/report/generate?${params}`, {
            method: 'POST',
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to generate report');

        if (type === 'pdf') {
            // For PDF, get the blob and download
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `report_${datasetId}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            return { success: true, message: 'Report downloaded' };
        }

        return response.json();
    },

    async getReportHistory(sessionId) {
        const response = await fetch(`${API_V1}/reports/history/${sessionId}`, {
            headers: getHeaders()
        });
        await throwIfNotOk(response, 'Failed to fetch report history')
        return safeJson(response)
    }
};

// ==================== Tools & Registry ====================

export const toolsAPI = {
    async listTools(scope = null) {
        const url = scope ? `${API_V1}/v1/tools?scope=${scope}` : `${API_V1}/v1/tools`;
        const response = await fetch(url, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch tools');
        return response.json();
    },

    async getTool(toolId) {
        const response = await fetch(`${API_V1}/v1/tools/${toolId}`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch tool');
        return response.json();
    },

    async validateTool(toolId, inputs) {
        const response = await fetch(`${API_V1}/v1/tools/${toolId}/validate`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ inputs })
        });
        if (!response.ok) throw new Error('Failed to validate tool');
        return response.json();
    },

    async callTool(toolId, inputs) {
        const response = await fetch(`${API_V1}/v1/tools/${toolId}/call`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ inputs })
        });
        if (!response.ok) throw new Error('Failed to call tool');
        return response.json();
    }
};

// ==================== Health & System ====================

export const systemAPI = {
    async healthCheck() {
        const response = await fetch(`${API_BASE_URL}/health`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Backend is unavailable');
        return response.json();
    },

    async getStatus() {
        const response = await fetch(`${API_BASE_URL}/`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch status');
        return response.json();
    }
};

// ==================== Kaggle ====================

export const kaggleAPI = {
    async search({ query, page = 1, kaggle_username = null, kaggle_key = null }) {
        const response = await fetch(`${API_V1}/kaggle/search`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ query, page, kaggle_username, kaggle_key })
        })
        if (!response.ok) throw new Error('Failed to search Kaggle datasets')
        return response.json()
    },

    async download(datasetRef, kaggleUsername = null, kaggleKey = null) {
        const response = await fetch(`${API_V1}/kaggle/download`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                dataset_ref: datasetRef,
                kaggle_username: kaggleUsername,
                kaggle_key: kaggleKey
            })
        })
        if (!response.ok) throw new Error('Failed to download Kaggle dataset')
        return response.json()
    }
}

// ==================== Shared Utility ====================

/**
 * Ensures a dataset object has a backend id.
 * If dataset.id is already set, returns it immediately.
 * Otherwise uploads the in-memory rows as CSV and returns the new backend id.
 */
export async function ensureBackendDataset(dataset) {
    // If the dataset already has a backend id, the full data is already there — use it directly.
    if (dataset?.id) return dataset.id

    if (!dataset?.headers?.length) throw new Error('Dataset has no headers to upload.')

    const headers = dataset.headers
    const rows = dataset.rows || []

    if (rows.length === 0) throw new Error('Dataset has no rows to upload.')

    const escapeCell = (v) => {
        const t = v == null ? '' : String(v)
        return (t.includes(',') || t.includes('"') || t.includes('\n'))
            ? `"${t.replace(/"/g, '""')}"` : t
    }
    const csvText = [
        headers.map(escapeCell).join(','),
        ...rows.map((r) => headers.map((h) => escapeCell(r?.[ h ])).join(','))
    ].join('\n')

    const uploadName = (dataset.name || 'dataset').endsWith('.csv')
        ? (dataset.name || 'dataset.csv')
        : `${dataset.name || 'dataset'}.csv`

    const uploaded = await datasetAPI.uploadDataset(
        new File([ csvText ], uploadName, { type: 'text/csv' })
    )
    if (!uploaded?.id) throw new Error('Backend did not return a dataset id after upload.')
    return uploaded.id
}

// ==================== Error Handler ====================

export const handleApiError = (error) => {
    if (error instanceof TypeError) {
        return 'Network error. Please check your connection and backend server.';
    }
    return error.message || 'An unexpected error occurred';
};
