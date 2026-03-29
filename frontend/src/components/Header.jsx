import React, { useState, useRef } from 'react'
import { Menu, Upload, Database, X, AlertCircle } from 'lucide-react'
import { datasetAPI } from '../services/api'

function Header({ dataset, setDataset, toggleSidebar, isMobile }) {
    const [ uploading, setUploading ] = useState(false)
    const [ uploadError, setUploadError ] = useState(null)
    const fileInputRef = useRef(null)

    const handleFileUpload = async (e) => {
        const file = e.target.files[ 0 ]
        if (!file) return
        e.target.value = ''
        setUploading(true)
        setUploadError(null)
        try {
            const data = await datasetAPI.uploadDataset(file)
            setDataset(data)
        } catch (err) {
            setUploadError(err?.message || 'Upload failed. Please use CSV, XLSX, XLS, JPG, JPEG, or PNG.')
        } finally {
            setUploading(false)
        }
    }

    return (
        <header className="sticky top-0 z-30 px-4 pb-4 pt-4 md:px-6">
            <div className="surface-panel rounded-2xl px-4 py-3 md:px-6 md:py-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex min-w-[260px] items-center gap-3 md:gap-4">
                        <button
                            onClick={toggleSidebar}
                            className="rounded-xl border border-slate-200 bg-white/85 p-2 text-slate-700 shadow-sm transition-colors hover:bg-slate-100"
                            aria-label="Toggle sidebar"
                        >
                            <Menu size={20} />
                        </button>
                        <div>
                            <h2 className="title-display text-lg font-bold tracking-tight text-slate-900 md:text-2xl">
                                AI Data Science Research Assistant
                            </h2>
                            <p className="text-xs font-medium text-slate-500 md:text-sm">
                                {isMobile ? 'Mobile workspace mode' : 'Collaborative analytics workspace'}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-3">
                        {dataset ? (
                            <div className="flex max-w-full items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/95 px-3 py-2 shadow-sm md:px-4">
                                <Database size={18} className="text-emerald-700" />
                                <div className="max-w-[200px] md:max-w-[260px]">
                                    <p className="truncate text-sm font-semibold text-emerald-800">{dataset.name}</p>
                                    <p className="text-xs text-emerald-700">{dataset.rowCount} rows x {dataset.colCount} cols</p>
                                </div>
                                <button
                                    onClick={() => setDataset(null)}
                                    className="rounded p-1 transition-colors hover:bg-emerald-100"
                                    aria-label="Remove dataset"
                                >
                                    <X size={16} className="text-emerald-700" />
                                </button>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-slate-200 bg-white/85 px-3 py-2 text-sm font-medium text-slate-500 shadow-sm">
                                No dataset loaded
                            </div>
                        )}

                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            accept=".csv,.xlsx,.xls,.jpg,.jpeg,.png"
                            className="hidden"
                        />

                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="btn-primary flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                            <Upload size={18} />
                            {uploading ? 'Uploading...' : 'Upload File'}
                        </button>
                    </div>
                </div>

                {uploadError && (
                    <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                        <AlertCircle size={15} className="shrink-0" />
                        <span>{uploadError}</span>
                        <button onClick={() => setUploadError(null)} className="ml-auto text-red-400 hover:text-red-600">
                            <X size={14} />
                        </button>
                    </div>
                )}
            </div>
        </header>
    )
}

export default Header
