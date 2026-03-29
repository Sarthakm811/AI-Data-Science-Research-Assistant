/**
 * API Service Layer
 * Centralized API communication with backend
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || '';
const API_V1 = `${API_BASE_URL}/api`;
const API_KEY = import.meta.env.VITE_API_KEY || 'dev-local-9f4e1d2c7a8b3f6e';
const TENANT_ID = 'public';

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

// ==================== Session Management ====================

export const sessionAPI = {
    async createSession(userId = null) {
        const response = await fetch(`${API_V1}/sessions`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ user_id: userId })
        });
        if (!response.ok) throw new Error('Failed to create session');
        return response.json();
    },

    async getSessionHistory(sessionId) {
        const response = await fetch(`${API_V1}/sessions/${sessionId}/history`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch session history');
        return response.json();
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
        if (!response.ok) throw new Error('Failed to search datasets');
        return response.json();
    },

    async getDataset(datasetId) {
        const response = await fetch(`${API_V1}/datasets/${datasetId}`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch dataset');
        return response.json();
    },

    async listDatasets() {
        const response = await fetch(`${API_V1}/datasets`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch datasets');
        return response.json();
    },

    async uploadDataset(file) {
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch(`${API_V1}/datasets/upload`, {
            method: 'POST',
            headers: {
                'X-API-Key': API_KEY,
                'X-Tenant-Id': TENANT_ID
            },
            body: formData
        });
        if (!response.ok) throw new Error('Failed to upload dataset');
        return response.json();
    },

    async deleteDataset(datasetId) {
        const response = await fetch(`${API_V1}/datasets/${datasetId}`, {
            method: 'DELETE',
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to delete dataset');
        return response.json();
    },

    async getDatasetPreview(datasetId, rows = 10) {
        const response = await fetch(`${API_V1}/datasets/${datasetId}/preview?rows=${rows}`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch dataset preview');
        return response.json();
    },

    async cleanDataset(datasetId, cleaningRequest) {
        const response = await fetch(`${API_V1}/datasets/${datasetId}/clean`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(cleaningRequest)
        });
        if (!response.ok) throw new Error('Failed to clean dataset');
        return response.json();
    },

    async featureEngineerDataset(datasetId, request) {
        const response = await fetch(`${API_V1}/datasets/${datasetId}/feature-engineer`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(request)
        });
        if (!response.ok) throw new Error('Failed to save engineered dataset');
        return response.json();
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
        if (!response.ok) throw new Error('Failed to run statistical analysis');
        return response.json();
    }
};

// ==================== Query & Analysis ====================

export const queryAPI = {
    async submitQuery(sessionId, query, datasetId = null) {
        const response = await fetch(`${API_V1}/query`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                session_id: sessionId,
                query,
                dataset_id: datasetId
            })
        });
        if (!response.ok) throw new Error('Failed to submit query');
        return response.json();
    },

    async enhancedQuery(sessionId, query, datasetId, autoEda = true, autoMl = false) {
        const response = await fetch(`${API_V1}/query/enhanced`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                session_id: sessionId,
                query,
                dataset_id: datasetId,
                auto_eda: autoEda,
                auto_ml: autoMl
            })
        });
        if (!response.ok) throw new Error('Failed to process enhanced query');
        return response.json();
    },

    async langchainQuery(sessionId, query, datasetId = null) {
        const response = await fetch(`${API_V1}/query/langchain`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                session_id: sessionId,
                query,
                dataset_id: datasetId
            })
        });
        if (!response.ok) throw new Error('Failed to process langchain query');
        return response.json();
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
                analysis_type: 'full'
            })
        });
        if (!response.ok) throw new Error('Failed to analyze dataset');
        return response.json();
    },

    async runStatisticalTests(datasetId, column1, column2 = null) {
        const response = await fetch(`${API_V1}/eda/statistical-tests`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                dataset_id: datasetId,
                column1,
                column2
            })
        });
        if (!response.ok) throw new Error('Failed to run statistical tests');
        return response.json();
    }
};

// ==================== Machine Learning ====================

export const mlAPI = {
    async trainModel(datasetId, sessionId, targetColumn, modelType = 'auto') {
        const response = await fetch(`${API_V1}/analysis/auto`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                session_id: sessionId,
                dataset_id: datasetId,
                analysis_type: 'ml',
                target_column: targetColumn,
                model_type: modelType
            })
        });
        if (!response.ok) throw new Error('Failed to train model');
        return response.json();
    },

    async getFeatureImportance(modelId) {
        const response = await fetch(`${API_V1}/explain/feature-importance?model_id=${encodeURIComponent(modelId)}`, {
            method: 'POST',
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch feature importance');
        return response.json();
    },

    async predictWithModel(datasetId, modelId, data) {
        const response = await fetch(`${API_V1}/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dataset_id: datasetId,
                model_id: modelId,
                data: data
            })
        });
        if (!response.ok) throw new Error('Failed to make prediction');
        return response.json();
    }
};

// ==================== AI Chat ====================

export const chatAPI = {
    async sendMessage(message, datasetId = null, sessionId = null) {
        const response = await fetch(`${API_V1}/chat`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                message,
                dataset_id: datasetId,
                session_id: sessionId
            })
        });
        if (!response.ok) throw new Error('Failed to send message');
        return response.json();
    },

    async getChatHistory(sessionId) {
        const response = await fetch(`${API_V1}/chat/history/${sessionId}`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch chat history');
        return response.json();
    }
};

// ==================== Report Generation ====================

export const reportAPI = {
    async generateReport(datasetId, type = 'pdf', sessionId = null) {
        const response = await fetch(`${API_V1}/report/generate`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                dataset_id: datasetId,
                type,
                session_id: sessionId
            })
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
        if (!response.ok) throw new Error('Failed to fetch report history');
        return response.json();
    }
};

// ==================== Tools & Registry ====================

export const toolsAPI = {
    async listTools(scope = null) {
        const url = scope ? `${API_BASE_URL}/api/v1/tools?scope=${scope}` : `${API_BASE_URL}/api/v1/tools`;
        const response = await fetch(url, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch tools');
        return response.json();
    },

    async getTool(toolId) {
        const response = await fetch(`${API_BASE_URL}/api/v1/tools/${toolId}`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch tool');
        return response.json();
    },

    async validateTool(toolId, inputs) {
        const response = await fetch(`${API_BASE_URL}/api/v1/tools/${toolId}/validate`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ inputs })
        });
        if (!response.ok) throw new Error('Failed to validate tool');
        return response.json();
    },

    async callTool(toolId, inputs) {
        const response = await fetch(`${API_BASE_URL}/api/v1/tools/${toolId}/call`, {
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
    if (dataset?.id) return dataset.id

    if (!dataset?.headers?.length) throw new Error('Dataset has no headers to upload.')

    const headers = dataset.headers
    const rows = dataset.rows || []
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
