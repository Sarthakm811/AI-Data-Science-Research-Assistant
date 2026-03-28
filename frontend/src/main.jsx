import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

const API_KEY = import.meta.env.VITE_API_KEY
const ENV_TENANT_ID = import.meta.env.VITE_TENANT_ID

function resolveTenantId() {
    if (ENV_TENANT_ID) return ENV_TENANT_ID
    if (typeof window === 'undefined') return null

    const existing = window.localStorage.getItem('tenant_id')
    if (existing) return existing

    const generated = window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `tenant-${Date.now()}-${Math.random().toString(16).slice(2)}`
    window.localStorage.setItem('tenant_id', generated)
    return generated
}

const TENANT_ID = resolveTenantId()

if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
    const originalFetch = window.fetch.bind(window)
    window.fetch = (input, init = {}) => {
        const headers = new Headers(init.headers || {})
        if (API_KEY && !headers.has('X-API-Key')) {
            headers.set('X-API-Key', API_KEY)
        }
        if (TENANT_ID && !headers.has('X-Tenant-Id')) {
            headers.set('X-Tenant-Id', TENANT_ID)
        }
        return originalFetch(input, { ...init, headers })
    }
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
